namespace AstraMentoring_Backend.Services;

// Status is separate from grading. The inclusive Philippine deadline ends
// at the next midnight. No deadline means no inferred overdue/late status.
public static class CheckpointReportStatusPolicy
{
    public static string Classify(bool needsUpdate, string? logStatus, bool documentsComplete,
        DateTimeOffset? submittedAt, DateTimeOffset? deadlineExclusive, DateTimeOffset now)
    {
        bool overdue = deadlineExclusive.HasValue && now >= deadlineExclusive.Value;
        if (needsUpdate) return overdue ? "Needs Update — Overdue" : "Needs Update";
        if (logStatus == "Submitted" && documentsComplete && submittedAt.HasValue)
            return !deadlineExclusive.HasValue ? "Submitted — deadline unavailable"
                : submittedAt.Value < deadlineExclusive.Value ? "Submitted On Time" : "Submitted Late";
        return overdue ? "Overdue" : "Pending";
    }
}
