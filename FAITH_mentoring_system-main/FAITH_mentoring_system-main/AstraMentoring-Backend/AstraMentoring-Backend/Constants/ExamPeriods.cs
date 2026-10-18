namespace AstraMentoring_Backend.Constants
{
    // Fixed list for the "Period" calendar activity type (Prelims/Midterms/
    // Finals) — same for both semesters, unlike MentoringSlots. Reuses the
    // CalendarEvents.SlotName column and its existing per-semester unique
    // index, so "Prelims" can't be added twice in one semester either.
    public static class ExamPeriods
    {
        public static readonly string[] All = { "Prelims", "Midterms", "Finals" };
    }
}
