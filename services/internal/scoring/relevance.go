// Package scoring ranks a pool of news stories by a weighted blend of
// recency and relevance signals so the top 3 surfaced to the user feel
// curated rather than "first 3 the API returned".
//
// The scoring model is intentionally transparent — every input weight is a
// named constant so a reviewer can reason about (and tune) why a given
// story floated to the top.
package scoring

import (
	"math"
	"sort"
	"strings"
	"time"
)

// Story is the subset of TheNewsAPI "All News" response we care about.
// The upstream payload has more fields but these are the only ones that
// influence ranking or display.
type Story struct {
	UUID        string    `json:"uuid"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Snippet     string    `json:"snippet"`
	URL         string    `json:"url"`
	ImageURL    string    `json:"image_url"`
	Source      string    `json:"source"`
	Categories  []string  `json:"categories"`
	PublishedAt time.Time `json:"published_at"`
	Language    string    `json:"language"`
}

// Scored wraps a Story with the score we computed for it. The score is
// exposed in the API response so the client could (if it wanted) show a
// debug overlay, and so the highest-scoring story can be flagged as the
// "Story of the Hour" on mobile.
type Scored struct {
	Story
	Score        float64 `json:"score"`
	StoryOfHour  bool    `json:"story_of_hour"`
	WhyThisStory string  `json:"why_this_story"`
}

// Weight constants. These were chosen deliberately:
//
//   - Recency dominates because the product promises "today's top 3";
//     a story from 6 hours ago should outrank a great story from 2 days ago.
//   - Relevance signals (title quality, image presence, source diversity)
//     break ties between stories of similar age.
//   - We softly penalize stories with missing description or image because
//     they degrade the card UI even if they're newsworthy.
const (
	weightRecency     = 0.60
	weightContent     = 0.20
	weightSourceTrust = 0.10
	weightImpactWords = 0.10

	// Recency half-life in hours. Score = exp(-ln2 * ageHours / halfLife),
	// so a story exactly one half-life old gets 50% of the recency credit.
	recencyHalfLifeHours = 8.0

	// Anything older than this hard cap gets effectively zero recency credit;
	// "top of the day" should not be yesterday's news.
	maxAgeHours = 36.0
)

// impactWords are tokens that, when present in a title, indicate the story
// is consequential (breaking news, major announcements, regulatory action,
// etc.) rather than fluff. The list is short on purpose — we want the
// signal to be reliable, not noisy.
var impactWords = []string{
	"breaking", "exclusive", "announces", "announced", "launches", "launched",
	"unveils", "reveals", "warns", "rules", "ruling", "passes", "passed",
	"votes", "voted", "wins", "won", "loses", "lost", "dies", "died",
	"resigns", "resigned", "fires", "fired", "elected", "deal", "agreement",
	"crisis", "record", "first", "historic", "major",
}

// Rank takes a pool of stories and returns the top N, scored and sorted
// descending. Stories without a URL or title are filtered out — those would
// render as broken cards on the client.
func Rank(pool []Story, n int) []Scored {
	now := time.Now().UTC()

	out := make([]Scored, 0, len(pool))
	for _, s := range pool {
		if strings.TrimSpace(s.Title) == "" || strings.TrimSpace(s.URL) == "" {
			continue
		}
		out = append(out, Scored{Story: s, Score: score(s, now)})
	}

	sort.SliceStable(out, func(i, j int) bool {
		return out[i].Score > out[j].Score
	})

	// Enforce source diversity in the top N: if we already picked a story
	// from "Reuters", prefer the next-highest story from a different source
	// over a second Reuters story of similar score. This keeps the top 3
	// from looking like a single outlet's homepage.
	out = diversifyBySource(out, n)

	if len(out) > n {
		out = out[:n]
	}

	// Flag the single highest-scoring item as Story of the Hour. The client
	// uses this on mobile to render a badge on the lead card.
	if len(out) > 0 {
		out[0].StoryOfHour = true
	}

	return out
}

// score computes a story's overall ranking score in [0, 1] (approximately).
// Each component is independently in [0, 1] and weighted by the constants
// above, so the final score is also bounded ~[0, 1].
func score(s Story, now time.Time) float64 {
	return weightRecency*recencyScore(s.PublishedAt, now) +
		weightContent*contentScore(s) +
		weightSourceTrust*sourceTrustScore(s.Source) +
		weightImpactWords*impactScore(s.Title)
}

// recencyScore uses exponential decay with a defined half-life so the curve
// is smooth (vs. a step function) and well-behaved at the edges.
func recencyScore(published, now time.Time) float64 {
	if published.IsZero() {
		return 0
	}
	ageHours := now.Sub(published).Hours()
	if ageHours < 0 {
		// Future-dated story (clock skew). Treat as "now".
		ageHours = 0
	}
	if ageHours > maxAgeHours {
		return 0
	}
	return math.Exp(-math.Ln2 * ageHours / recencyHalfLifeHours)
}

// contentScore rewards stories that will render well on the card:
// a description of reasonable length and the presence of an image.
func contentScore(s Story) float64 {
	score := 0.0

	desc := strings.TrimSpace(s.Description)
	if desc == "" {
		desc = strings.TrimSpace(s.Snippet)
	}
	switch {
	case len(desc) >= 120:
		score += 0.7
	case len(desc) >= 60:
		score += 0.5
	case len(desc) > 0:
		score += 0.2
	}

	if strings.TrimSpace(s.ImageURL) != "" {
		score += 0.3
	}

	if score > 1 {
		score = 1
	}
	return score
}

// sourceTrustScore is a coarse, hand-tuned bias toward outlets with
// editorial standards. This is intentionally conservative — we only nudge
// well-known wire services and major papers up; we don't penalize anyone.
var trustedSources = map[string]float64{
	"reuters.com":         1.0,
	"apnews.com":          1.0,
	"bbc.com":             0.95,
	"bbc.co.uk":           0.95,
	"nytimes.com":         0.9,
	"washingtonpost.com":  0.9,
	"theguardian.com":     0.9,
	"wsj.com":             0.9,
	"bloomberg.com":       0.9,
	"ft.com":              0.9,
	"npr.org":             0.85,
	"cnn.com":             0.75,
	"cnbc.com":            0.75,
	"theverge.com":        0.8,
	"techcrunch.com":      0.75,
	"arstechnica.com":     0.8,
	"wired.com":           0.8,
	"axios.com":           0.8,
	"politico.com":        0.8,
	"economist.com":       0.9,
}

func sourceTrustScore(source string) float64 {
	if v, ok := trustedSources[strings.ToLower(strings.TrimSpace(source))]; ok {
		return v
	}
	// Unknown source — neutral, not penalized. Plenty of great local outlets
	// won't be in the map.
	return 0.5
}

// impactScore counts how many impact words appear in the title, capped at 1.
// Two impact words is plenty of signal; more usually means clickbait.
func impactScore(title string) float64 {
	if title == "" {
		return 0
	}
	lower := strings.ToLower(title)
	hits := 0
	for _, w := range impactWords {
		if strings.Contains(lower, w) {
			hits++
			if hits >= 2 {
				break
			}
		}
	}
	return float64(hits) / 2.0
}

// diversifyBySource walks the sorted list and prefers picking one story per
// source until we have N picks, then fills any remaining slots without that
// constraint. This is a soft preference — if there are only 2 sources in
// the whole pool we still return N stories.
func diversifyBySource(sorted []Scored, n int) []Scored {
	if n <= 0 || len(sorted) <= n {
		return sorted
	}

	picked := make([]Scored, 0, n)
	seenSources := make(map[string]bool)
	leftovers := make([]Scored, 0)

	for _, s := range sorted {
		src := strings.ToLower(strings.TrimSpace(s.Source))
		if !seenSources[src] && len(picked) < n {
			picked = append(picked, s)
			seenSources[src] = true
		} else {
			leftovers = append(leftovers, s)
		}
	}

	// Fill any remaining slots from leftovers (in original score order).
	for _, s := range leftovers {
		if len(picked) >= n {
			break
		}
		picked = append(picked, s)
	}

	return picked
}
