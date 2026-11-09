# Totoshka: guessing merchant labels for Review

The finance app never calls a paid AI API itself. Totoshka (the Telegram assistant) does the
thinking and hands its answers to the app, which shows them in **Review** as *Totoshka's guess*
and pre-fills the English name and category. Egor still confirms each one with one tap.

All calls use the existing assistant access: header `X-Assistant-Key: <ASSISTANT_KEY>` against
`<API_URL>/api/...` (the same base URL and key Totoshka already uses for the Cal sync).

## 1. Get merchants to guess

```
GET /api/review/to-guess?limit=20
```

Returns merchants waiting in Review that have no guess yet:

```json
{
  "categories": ["Bank fees", "BIT", "Clothes", "Coffee", "Eating out", "..."],
  "merchants": [
    {
      "merchant_he": "מספרה חדשה",
      "bank_category_he": "טיפוח ויופי",
      "bank_category": "Beauty & Personal Care",
      "example": { "date": "2026-06-12", "amount": 180 },
      "charges": 2,
      "history": [{ "date": "2026-06-12", "amount": 180 }, { "date": "2026-05-15", "amount": 180 }],
      "same_day": [{ "merchant": "Arcaffe", "category": "Coffee", "amount": 41.28 }]
    }
  ]
}
```

An empty `merchants` list means there is nothing to do.

## 2. Send the guesses back

```
POST /api/review/suggestions
Content-Type: application/json

{
  "suggestions": [
    {
      "merchant_he": "מספרה חדשה",
      "english_name": "New Barbershop",
      "category": "Beauty & Personal Care",
      "confidence": "high",
      "reason": "\"מספרה חדשה\" means \"new barbershop\"; ₪180 every few weeks fits a haircut."
    }
  ]
}
```

Rules the API enforces:

- `merchant_he` exactly as received.
- `category` must be one of `categories` from step 1 (anything else is skipped and reported back).
- `english_name` up to 80 characters; `reason` one short sentence (cut at 300 characters).
- `confidence`: `low`, `medium` or `high`. Use `low` when the name is ambiguous; the app then
  fills in the name but leaves the category for Egor to pick.

The response says how many were saved and why any were skipped:
`{ "saved": 1, "skipped": [] }`. Sending a merchant again replaces its earlier guess.

## Instructions to give Totoshka

> When Egor asks you to "guess my new merchants" (and once a day on your own), call
> `GET /api/review/to-guess`. For each merchant, work out what the business is from the Hebrew
> name, the bank's category, the amounts and the other places paid that day. Reply in English:
> a short English name an English speaker would recognise (known Israeli chains by their usual
> English name), the best category from the list you were given, your confidence, and one
> sentence saying what the Hebrew means and why you chose that category. Send them all in one
> `POST /api/review/suggestions`. Then tell Egor in Telegram how many you guessed and that they're
> waiting in Review.

## Other routes Totoshka may use

| Route | What for |
|---|---|
| `POST /api/review/hints` `{ transaction: { merchant_he, date, charge_amount } }` | Same hints the app shows for one merchant |
| `POST /api/review/confirm` | Save a label directly, if Egor tells Totoshka what a merchant is |
| `POST /api/adjustments/category` `{ transaction: { date, merchant_he, charge_amount }, category }` | Set the category of one charge, e.g. a BIT transfer Egor explains in chat |

## Waking the analyzer before an upload

The analyzer runs on Render's free tier and sleeps after ~15 minutes without traffic. Render
often does **not** wake it for server-to-server requests, so `GET /api/ingest/wake` (the API
pinging the analyzer) can fail for minutes even though the analyzer is healthy. The web app
avoids this by waking it from the browser; Totoshka should do the same:

1. `GET https://finance-analyzer-jsoq.onrender.com/health` directly (no key needed). Retry every
   10 seconds for up to 3 minutes until it returns `200 {"status":"ok"}`. A cold start usually
   takes 20–60 seconds.
2. Then upload as usual (`POST /api/ingest`). It stays awake for ~15 minutes after the last request.

Only if step 1 never succeeds is the analyzer actually down; then it needs a Restart or Manual
Deploy in the Render dashboard.
