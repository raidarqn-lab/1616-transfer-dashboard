# Weekly Alliance Duel participants

Apply `weekly-participants.sql` to the linked Supabase project before deploying the frontend. It preserves the existing reviewer guard and current-roster behavior. Only requests with `alliance: NvSP` and `duelView: true` include players whose approved VS scores record NvSP within the selected Monday–Sunday week. Current membership remains unchanged. Scores remain linked to the shared player key across alliance changes.

Verified with a rollback transaction: YouMad is absent from the current NvSP roster, present in the September 28 duel with current alliance WaE, absent from an unrelated future week, and inaccessible to an unauthorized caller. A synthetic browser test exercised the actual frontend profile opening, failure/retry, closing/reopening, and VS activity display. All 199 relevant live profile API calls succeeded; the specific reported intermittent opening failure was not reproduced.
