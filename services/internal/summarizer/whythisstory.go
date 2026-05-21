// Package summarizer produces the one-sentence "Why this story?" blurb that
// appears on each card.
//
// We deliberately do NOT call an LLM here. The product constraint is that
// the blurb is "exactly one sentence — authoritative and punchy". A
// deterministic heuristic written against the same signals the scorer
// already computed gives us:
//
//   - Zero latency / zero cost / zero external dependency.
//   - A blurb that is always grounded in real facts about the story
//     (its source, its age, its category, its impact words) instead of an
//     LLM hallucination.
//   - A defensible answer to "how does this work?" in an interview.
//
// If a future iteration wants to plug in an LLM, the surface area is small:
// swap the body of Generate for a network call and keep the same signature.
package summarizer

import (
	"fmt"
	"strings"
	"time"

	"github.com/news-reader/services/internal/scoring"
)

// Generate returns a single-sentence explanation of why this story matters,
// based purely on signals already present in the Story plus the scorer's
// output. The sentence is always:
//
//   - Exactly one sentence (one terminal period).
//   - Punchy: < ~25 words.
//   - Grounded: every claim ("just broke", "from Reuters", "tech sector")
//     is derived from a real field on the story.
func Generate(s scoring.Scored, now time.Time) string {
	parts := []string{}

	// Lead with recency if the story is genuinely fresh.
	ageHours := now.Sub(s.PublishedAt).Hours()
	switch {
	case s.PublishedAt.IsZero():
		// fall through — we'll lead with something else
	case ageHours < 1:
		parts = append(parts, "Just broke within the last hour")
	case ageHours < 3:
		parts = append(parts, fmt.Sprintf("Filed %.0f hours ago and still developing", ageHours))
	case ageHours < 8:
		parts = append(parts, "Among the most recent in today's cycle")
	}

	// Source credibility (only if it's a notably trusted outlet).
	if trusted := trustedSourceLabel(s.Source); trusted != "" {
		parts = append(parts, fmt.Sprintf("from %s", trusted))
	}

	// Category framing — gives the user a "why this fits my interests" anchor.
	if cat := primaryCategory(s.Categories); cat != "" {
		parts = append(parts, fmt.Sprintf("in the %s beat", cat))
	}

	// Impact framing — only if the title actually contains an impact cue.
	if cue := impactCue(s.Title); cue != "" {
		parts = append(parts, fmt.Sprintf("flagged for its %s language", cue))
	}

	// If we somehow have nothing (very sparse story), fall back to a
	// generic-but-still-grounded line.
	if len(parts) == 0 {
		return "Ranked highly by today's recency-and-relevance model against the rest of the news pool."
	}

	// Assemble into one sentence. Capitalize the first character, end with
	// a single period, and collapse any accidental double spaces.
	sentence := joinClauses(parts) + "."
	sentence = strings.ToUpper(sentence[:1]) + sentence[1:]
	sentence = strings.ReplaceAll(sentence, "  ", " ")
	return sentence
}

// joinClauses joins phrases into a natural-reading clause:
//
//	["A", "B", "C"]  -> "A, B, C"
//	["A", "B"]       -> "A, B"
//	["A"]            -> "A"
//
// We intentionally use commas rather than "and" so the sentence stays
// punchy and doesn't read like a run-on.
func joinClauses(parts []string) string {
	return strings.Join(parts, ", ")
}

// trustedSourceLabel returns a human-friendly label for a known trusted
// source, or "" if the source isn't on our short list. Keeping this in sync
// with scoring.trustedSources is intentional — the blurb should only brag
// about outlets the scorer already gave a trust bonus to.
func trustedSourceLabel(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "reuters.com":
		return "Reuters"
	case "apnews.com":
		return "the Associated Press"
	case "bbc.com", "bbc.co.uk":
		return "the BBC"
	case "nytimes.com":
		return "The New York Times"
	case "washingtonpost.com":
		return "The Washington Post"
	case "theguardian.com":
		return "The Guardian"
	case "wsj.com":
		return "The Wall Street Journal"
	case "bloomberg.com":
		return "Bloomberg"
	case "ft.com":
		return "the Financial Times"
	case "npr.org":
		return "NPR"
	case "theverge.com":
		return "The Verge"
	case "techcrunch.com":
		return "TechCrunch"
	case "arstechnica.com":
		return "Ars Technica"
	case "wired.com":
		return "Wired"
	case "axios.com":
		return "Axios"
	case "politico.com":
		return "Politico"
	case "economist.com":
		return "The Economist"
	case "cnbc.com":
		return "CNBC"
	}
	return ""
}

// primaryCategory returns a presentable label for the first category on the
// story, or "" if none. We lowercase it because TheNewsAPI returns mixed
// case ("Tech", "tech", etc.) and the surrounding sentence reads better in
// lower case ("in the tech beat" vs "in the Tech beat").
func primaryCategory(categories []string) string {
	for _, c := range categories {
		c = strings.TrimSpace(strings.ToLower(c))
		if c == "" || c == "general" {
			continue
		}
		return c
	}
	return ""
}

// impactCue returns a short label describing the kind of impact language in
// the title ("breaking", "decisive", "announcement", ...) or "" if none.
// Keep this conservative — false positives make the blurb sound generic.
func impactCue(title string) string {
	lower := strings.ToLower(title)
	switch {
	case strings.Contains(lower, "breaking") || strings.Contains(lower, "exclusive"):
		return "breaking-news"
	case strings.Contains(lower, "announce") || strings.Contains(lower, "unveil") ||
		strings.Contains(lower, "launch") || strings.Contains(lower, "reveal"):
		return "announcement"
	case strings.Contains(lower, "warn") || strings.Contains(lower, "crisis") ||
		strings.Contains(lower, "ruling") || strings.Contains(lower, "rules"):
		return "consequential"
	case strings.Contains(lower, "record") || strings.Contains(lower, "historic") ||
		strings.Contains(lower, "first ") || strings.Contains(lower, "major "):
		return "milestone"
	}
	return ""
}
