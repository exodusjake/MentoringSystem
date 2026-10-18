using Dapper;
using Microsoft.Data.SqlClient;
using System.Data;

namespace AstraMentoring_Backend.Services;

internal static class CheckpointAttendanceLock
{
    public static async Task AcquireAsync(
        SqlConnection conn,
        IDbTransaction tx,
        int mentorId,
        int menteeId,
        string? schoolYear,
        string? semester,
        string? slotName)
    {
        if (string.IsNullOrWhiteSpace(slotName)) return;

        var resource = $"checkpoint-attendance:{mentorId}:{menteeId}:{schoolYear}:{semester}:{slotName}";
        var result = await conn.QuerySingleAsync<int>(@"
            DECLARE @LockResult int;
            EXEC @LockResult = sys.sp_getapplock
                @Resource = @Resource,
                @LockMode = 'Exclusive',
                @LockOwner = 'Transaction',
                @LockTimeout = 10000;
            SELECT @LockResult;",
            new { Resource = resource }, tx);
        if (result < 0)
            throw new InvalidOperationException("Could not serialize checkpoint attendance and booking.");
    }
}
