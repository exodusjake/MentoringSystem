using Microsoft.Data.SqlClient;

namespace AstraMentoring_Backend.Services
{
    // Retries a transient SQL failure with a short backoff. Only wrap
    // read-only/idempotent calls.
    public static class BaselineSqlRetry
    {
        private static readonly int[] DelaysMs = { 200, 800, 2000 };

        public static async Task<T> ExecuteAsync<T>(Func<Task<T>> action)
        {
            for (var attempt = 0; ; attempt++)
            {
                try
                {
                    return await action();
                }
                catch (Exception ex) when (attempt < DelaysMs.Length && IsTransient(ex))
                {
                    await Task.Delay(DelaysMs[attempt]);
                }
            }
        }

        // -2 = timeout; the rest are common transient SQL error numbers.
        private static bool IsTransient(Exception ex) =>
            ex is SqlException sqlEx &&
            sqlEx.Number is -2 or 1205 or 4060 or 40197 or 40501 or 40613 or 49918 or 49919 or 49920;
    }
}
