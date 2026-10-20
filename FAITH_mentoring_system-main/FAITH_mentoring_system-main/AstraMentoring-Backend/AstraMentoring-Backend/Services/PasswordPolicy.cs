namespace AstraMentoring_Backend.Services
{
    // One password rule for every place an account password is created or changed:
    // at least 8 characters, at least 1 uppercase letter and at least 1 number.
    public static class PasswordPolicy
    {
        public const string Message = "Password must have at least 8 characters, 1 uppercase letter and 1 number.";

        public static string? Validate(string? password)
        {
            if (string.IsNullOrEmpty(password)) return "Password is required.";
            if (password.Length > 100) return "Password is too long (100 characters at most).";
            if (password.Length < 8 || !password.Any(char.IsUpper) || !password.Any(char.IsDigit)) return Message;
            return null;
        }
    }
}
