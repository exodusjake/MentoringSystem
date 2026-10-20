using AstraMentoringAPI;
using Xunit;

namespace AstraMentoringAPI.Tests;

public class LoginCodeStoreTests
{
    [Fact]
    public void CorrectCode_VerifiesOnce()
    {
        var store = new LoginCodeStore();
        var (id, code) = store.Create(7, true);

        Assert.Equal(LoginCodeStore.VerifyStatus.Ok, store.Verify(id, code, out var v));
        Assert.Equal(7, v!.UserId);
        Assert.True(v.RememberMe);
        Assert.Equal(LoginCodeStore.VerifyStatus.Expired, store.Verify(id, code, out _));
    }

    [Fact]
    public void WrongCode_LocksOutAfterMaxAttempts()
    {
        var store = new LoginCodeStore();
        var (id, code) = store.Create(1, false);
        var wrong = code == "000000" ? "111111" : "000000";

        for (var i = 0; i < LoginCodeStore.MaxAttempts - 1; i++)
            Assert.Equal(LoginCodeStore.VerifyStatus.Invalid, store.Verify(id, wrong, out _));
        Assert.Equal(LoginCodeStore.VerifyStatus.TooManyAttempts, store.Verify(id, wrong, out _));
        Assert.Equal(LoginCodeStore.VerifyStatus.Expired, store.Verify(id, code, out _));
    }

    [Fact]
    public void ExpiredCode_IsRejected()
    {
        var now = DateTimeOffset.UtcNow;
        var store = new LoginCodeStore(() => now);
        var (id, code) = store.Create(1, false);
        now += LoginCodeStore.Lifetime + TimeSpan.FromSeconds(1);

        Assert.Equal(LoginCodeStore.VerifyStatus.Expired, store.Verify(id, code, out _));
    }

    [Fact]
    public void Resend_RespectsCooldown_AndInvalidatesOldCode()
    {
        var now = DateTimeOffset.UtcNow;
        var store = new LoginCodeStore(() => now);
        var (id, oldCode) = store.Create(1, false);

        Assert.NotNull(store.Resend(id).RetryAfter);
        now += LoginCodeStore.ResendCooldown + TimeSpan.FromSeconds(1);
        var (newCode, _, retry) = store.Resend(id);
        Assert.Null(retry);
        Assert.NotNull(newCode);

        if (newCode != oldCode)
            Assert.Equal(LoginCodeStore.VerifyStatus.Invalid, store.Verify(id, oldCode, out _));
        Assert.Equal(LoginCodeStore.VerifyStatus.Ok, store.Verify(id, newCode, out _));
    }
}
