namespace AstraMentoringAPI.Tests;

// Isolated tests: no database, accounts or network.
public class LoginAttemptTrackerTests
{
    private DateTimeOffset _now = new(2026, 10, 18, 8, 0, 0, TimeSpan.Zero);
    private LoginAttemptTracker NewTracker() => new(() => _now);

    [Fact]
    public void FourWrongPasswordsDoNotLock()
    {
        var tracker = NewTracker();
        for (int i = 0; i < 4; i++) tracker.RecordFailure("a@x.com");
        Assert.False(tracker.IsLocked("a@x.com"));
    }

    [Fact]
    public void FifthWrongPasswordLocksForOneMinute()
    {
        var tracker = NewTracker();
        for (int i = 0; i < 5; i++) tracker.RecordFailure("a@x.com");
        Assert.True(tracker.IsLocked("a@x.com"));
        _now = _now.AddSeconds(59);
        Assert.True(tracker.IsLocked("a@x.com"));
        _now = _now.AddSeconds(1);
        Assert.False(tracker.IsLocked("a@x.com"));
    }

    [Fact]
    public void AfterTheLockEndsTheAccountGetsFiveFreshTries()
    {
        var tracker = NewTracker();
        for (int i = 0; i < 5; i++) tracker.RecordFailure("a@x.com");
        _now = _now.AddMinutes(1);
        for (int i = 0; i < 4; i++) tracker.RecordFailure("a@x.com");
        Assert.False(tracker.IsLocked("a@x.com"));
        tracker.RecordFailure("a@x.com");
        Assert.True(tracker.IsLocked("a@x.com"));
    }

    [Fact]
    public void FailuresOlderThanOneMinuteNoLongerCount()
    {
        var tracker = NewTracker();
        for (int i = 0; i < 4; i++) tracker.RecordFailure("a@x.com");
        _now = _now.AddMinutes(1);
        tracker.RecordFailure("a@x.com");
        Assert.False(tracker.IsLocked("a@x.com"));
    }

    [Fact]
    public void SuccessfulLoginClearsEarlierFailures()
    {
        var tracker = NewTracker();
        for (int i = 0; i < 4; i++) tracker.RecordFailure("a@x.com");
        tracker.RecordSuccess("a@x.com");
        tracker.RecordFailure("a@x.com");
        Assert.False(tracker.IsLocked("a@x.com"));
    }

    [Fact]
    public void OneLockedAccountDoesNotBlockAnother()
    {
        var tracker = NewTracker();
        for (int i = 0; i < 5; i++) tracker.RecordFailure("a@x.com");
        Assert.True(tracker.IsLocked("a@x.com"));
        Assert.False(tracker.IsLocked("b@x.com"));
    }

    [Fact]
    public void EmailMatchingIgnoresCaseAndSpaces()
    {
        var tracker = NewTracker();
        for (int i = 0; i < 5; i++) tracker.RecordFailure(i % 2 == 0 ? "A@X.com " : "a@x.COM");
        Assert.True(tracker.IsLocked(" a@x.com"));
    }

    [Fact]
    public void MissingEmailIsHandledSafely()
    {
        var tracker = NewTracker();
        tracker.RecordFailure(null);
        Assert.False(tracker.IsLocked(null));
        tracker.RecordSuccess(null);
    }
}
