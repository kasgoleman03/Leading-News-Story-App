// Command scorer is the HTTP entry point for the Go side of the News Reader.
//
// It exposes a single endpoint:
//
//	POST /score
//	  body: { "category": "tech", "stories": [ ...raw TheNewsAPI items... ] }
//	  resp: {
//	    "category": "tech",
//	    "generated_at": "2026-05-21T20:45:00Z",
//	    "stories": [ ...top 3 ranked + scored + with why-this-story blurbs... ]
//	  }
//
// The Express proxy calls this endpoint after it fetches raw stories from
// TheNewsAPI. Keeping the HTTP boundary here (rather than embedding the
// scorer inside the proxy as a child process or shared lib) makes it easy
// to deploy the Go service independently later.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/news-reader/services/internal/scoring"
	"github.com/news-reader/services/internal/summarizer"
)

// defaultTopN is how many stories the top-stories endpoint surfaces. The
// product spec is 3 — a small, curated number is the entire point of the
// brief. Search results are a different mode (exploration, not briefing),
// so the request can override this via the optional `limit` field.
const (
	defaultTopN = 3
	maxLimit    = 25
)

type scoreRequest struct {
	Category string          `json:"category"`
	Stories  []scoring.Story `json:"stories"`
	// Limit is optional. When 0 (or absent) the scorer returns the default
	// top-N. The proxy uses this to ask for more results on search.
	Limit int `json:"limit,omitempty"`
}

type scoreResponse struct {
	Category    string            `json:"category"`
	GeneratedAt time.Time         `json:"generated_at"`
	Stories     []scoring.Scored  `json:"stories"`
}

func main() {
	port := os.Getenv("SCORER_PORT")
	if port == "" {
		port = "4100"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/score", handleScore)

	addr := ":" + port
	log.Printf("[scorer] Listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, withLogging(mux)); err != nil {
		log.Fatalf("[scorer] Server failed: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "news-reader-scorer",
	})
}

func handleScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req scoreRequest
	// Note: we do NOT call DisallowUnknownFields because TheNewsAPI may add
	// new fields to story payloads over time, and a benign upstream change
	// shouldn't take this service down. Go's default json behavior — ignore
	// unknown fields — is exactly what we want here.
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[scorer] bad request body: %v", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Stories) == 0 {
		// Empty pool isn't an error — just return an empty list and let the
		// client render its empty state. This keeps the contract simple.
		writeJSON(w, http.StatusOK, scoreResponse{
			Category:    normalizeCategory(req.Category),
			GeneratedAt: time.Now().UTC(),
			Stories:     []scoring.Scored{},
		})
		return
	}

	now := time.Now().UTC()

	// Clamp the requested limit. Zero/negative falls back to the default;
	// anything above maxLimit is capped to keep responses (and the
	// summarizer pass) bounded.
	limit := req.Limit
	if limit <= 0 {
		limit = defaultTopN
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	top := scoring.Rank(req.Stories, limit)

	// Attach the "Why this story?" blurb after ranking, not during, so
	// scoring stays a pure function of inputs and doesn't depend on the
	// summarizer.
	for i := range top {
		top[i].WhyThisStory = summarizer.Generate(top[i], now)
	}

	writeJSON(w, http.StatusOK, scoreResponse{
		Category:    normalizeCategory(req.Category),
		GeneratedAt: now,
		Stories:     top,
	})
}

func normalizeCategory(c string) string {
	c = strings.TrimSpace(strings.ToLower(c))
	if c == "" {
		return "all"
	}
	return c
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("[scorer] write error: %v", err)
	}
}

// withLogging wraps a handler with a one-line access log. Tiny, but
// invaluable when something doesn't render and you need to know whether
// the request even arrived.
func withLogging(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		h.ServeHTTP(w, r)
		log.Printf("[scorer] %s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
