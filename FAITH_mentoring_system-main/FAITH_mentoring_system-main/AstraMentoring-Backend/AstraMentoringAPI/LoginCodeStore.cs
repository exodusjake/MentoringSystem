using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace AstraMentoringAPI;

// Short-lived email verification codes for the second step of login. A
// challenge is created only after the password was verified; the JWT is not
// issued until the matching code is submitted. Held in memory (single API
// instance) — a restart simply makes pending codes invalid and the user logs
// in again. Codes are stored hashed and compared in constant time.
public sealed class LoginCodeStore
{
    public const int CodeLength = 6;
    public const int MaxAttempts = 5;
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(30);

    public enum VerifyStatus { Ok, Invalid, Expired, TooManyAttempts }

    public sealed record Verified(int UserId, bool RememberMe);

    private sealed class Challenge
    {
        public int UserId;
        public bool RememberMe;
        public byte[] CodeHash = Array.Empty<byte>();
        public DateTimeOffset ExpiresAt;
        public DateTimeOffset LastSentAt;
        public int Attempts;
    }

    private readonly ConcurrentDictionary<string, Challenge> _challenges = new(StringComparer.Ordinal);
    private readonly Func<DateTimeOffset> _now;

    public LoginCodeStore() : this(() => DateTimeOffset.UtcNow) { }

    public LoginCodeStore(Func<DateTimeOffset> now) => _now = now;

    private static string NewCode() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    private static byte[] Hash(string code) => SHA256.HashData(Encoding.UTF8.GetBytes(code));

    private void Purge()
    {
        var now = _now();
        foreach (var kv in _challenges)
            if (kv.Value.ExpiresAt <= now) _challenges.TryRemove(kv.Key, out _);
    }

    public (string ChallengeId, string Code) Create(int userId, bool rememberMe)
    {
        Purge();
        // One pending challenge per user — a fresh login supersedes older ones.
        foreach (var kv in _challenges)
            if (kv.Value.UserId == userId) _challenges.TryRemove(kv.Key, out _);

        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        var code = NewCode();
        var now = _now();
        _challenges[id] = new Challenge
        {
            UserId = userId,
            RememberMe = rememberMe,
            CodeHash = Hash(code),
            ExpiresAt = now + Lifetime,
            LastSentAt = now
        };
        return (id, code);
    }

    // Issues a new code for an existing challenge. Null when the challenge is
    // unknown/expired; RetryAfter is set when asked again within the cooldown.
    public (string? Code, int? UserId, TimeSpan? RetryAfter) Resend(string challengeId)
    {
        if (!_challenges.TryGetValue(challengeId ?? string.Empty, out var c)) return (null, null, null);
        lock (c)
        {
            var now = _now();
            if (c.ExpiresAt <= now) { _challenges.TryRemove(challengeId!, out _); return (null, null, null); }
            var wait = c.LastSentAt + ResendCooldown - now;
            if (wait > TimeSpan.Zero) return (null, c.UserId, wait);

            var code = NewCode();
            c.CodeHash = Hash(code);
            c.Attempts = 0;
            c.LastSentAt = now;
            c.ExpiresAt = now + Lifetime;
            return (code, c.UserId, null);
        }
    }

    public VerifyStatus Verify(string challengeId, string? code, out Verified? result)
    {
        result = null;
        if (!_challenges.TryGetValue(challengeId ?? string.Empty, out var c)) return VerifyStatus.Expired;
        lock (c)
        {
            if (c.ExpiresAt <= _now()) { _challenges.TryRemove(challengeId!, out _); return VerifyStatus.Expired; }
            if (c.Attempts >= MaxAttempts) { _challenges.TryRemove(challengeId!, out _); return VerifyStatus.TooManyAttempts; }

            c.Attempts++;
            var supplied = (code ?? string.Empty).Trim();
            if (!CryptographicOperations.FixedTimeEquals(Hash(supplied), c.CodeHash))
            {
                if (c.Attempts >= MaxAttempts) { _challenges.TryRemove(challengeId!, out _); return VerifyStatus.TooManyAttempts; }
                return VerifyStatus.Invalid;
            }

            _challenges.TryRemove(challengeId!, out _);
            result = new Verified(c.UserId, c.RememberMe);
            return VerifyStatus.Ok;
        }
    }
}
