using System.Reflection;
using System.Text.Json;
using AstraMentoring_Backend.Services;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class DashboardCancellationTests
{
    private static SqlException SqlFailure(int number)
    {
        var ctor = typeof(SqlError).GetConstructors(BindingFlags.Instance | BindingFlags.NonPublic)
            .OrderBy(c => c.GetParameters().Length).First();
        var args = ctor.GetParameters().Select(p =>
            p.ParameterType == typeof(string) ? (object)"synthetic" :
            p.ParameterType == typeof(int) && p.Name!.Contains("number", StringComparison.OrdinalIgnoreCase)
                && !p.Name.Contains("line", StringComparison.OrdinalIgnoreCase) ? number :
            p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null).ToArray();
        var error = (SqlError)ctor.Invoke(args);
        var errors = (SqlErrorCollection)Activator.CreateInstance(typeof(SqlErrorCollection), true)!;
        typeof(SqlErrorCollection).GetMethod("Add", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(errors, new object[] { error });
        var create = typeof(SqlException).GetMethods(BindingFlags.Static | BindingFlags.NonPublic)
            .First(m => m.Name == "CreateException" && m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(SqlErrorCollection));
        var result = (SqlException)create.Invoke(null, new object[] { errors, "synthetic" })!;
        Assert.Equal(number, result.Number);
        return result;
    }

    [Fact]
    public async Task SuccessPreservesBaselineResultAndSingleAttempt()
    {
        var expected = new { CompletedSessions = 1, RequiredSessions = 6,
            CompletenessPercent = 16.7, Counts = new[] { 0, 2, 6 } };
        var before = await BaselineSqlRetry.ExecuteAsync(() => Task.FromResult(expected));
        int calls = 0;
        var after = await SqlRetry.ExecuteAsync(() => { calls++; return Task.FromResult(expected); },
            retryTimeouts: false);
        Assert.Equal(JsonSerializer.Serialize(before), JsonSerializer.Serialize(after));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task PreCanceledRetryDoesNotRunAction()
    {
        using var cts = new CancellationTokenSource(); cts.Cancel(); int calls = 0;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => SqlRetry.ExecuteAsync(
            () => { calls++; return Task.FromResult(1); }, cts.Token));
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task CancellationDuringBackoffPreventsRetry()
    {
        using var cts = new CancellationTokenSource(); int calls = 0;
        var failure = SqlFailure(1205);
        var task = SqlRetry.ExecuteAsync<int>(() => { calls++; return Task.FromException<int>(failure); }, cts.Token);
        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task StatsTimeoutIsNotRetried()
    {
        int calls = 0; var failure = SqlFailure(-2);
        var actual = await Assert.ThrowsAsync<SqlException>(() => SqlRetry.ExecuteAsync<int>(
            () => { calls++; return Task.FromException<int>(failure); }, retryTimeouts: false));
        Assert.Same(failure, actual); Assert.Equal(1, calls);
    }

    [Fact]
    public async Task OtherCallersRetainTimeoutRetry()
    {
        int calls = 0; var failure = SqlFailure(-2);
        int value = await SqlRetry.ExecuteAsync(() => ++calls == 1
            ? Task.FromException<int>(failure) : Task.FromResult(42));
        Assert.Equal(42, value); Assert.Equal(2, calls);
    }

    [Fact]
    public async Task StatsRetainsDeadlockRetry()
    {
        int calls = 0; var failure = SqlFailure(1205);
        int value = await SqlRetry.ExecuteAsync(() => ++calls == 1
            ? Task.FromException<int>(failure) : Task.FromResult(42), retryTimeouts: false);
        Assert.Equal(42, value); Assert.Equal(2, calls);
    }

    [Fact]
    public async Task BothServicesRejectCancellationBeforeConstructingSqlConnection()
    {
        // Invalid sentinel prevents an accidental database connection even if a guard regresses.
        var config = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = "invalid-sentinel" }).Build();
        using var cts = new CancellationTokenSource(); cts.Cancel();
        var profile = new ProfileService(null!, null!, null!, config);
        var monitor = new MonitorActivitiesService(config, new EvaluationRatingsService(config));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => profile.GetUserStatsAsync(cts.Token));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => monitor.GetMentorOverviewAsync(cancellationToken: cts.Token));
        var usersController = new AstraMentoringAPI.Controllers.UsersController(profile);
        var monitorController = new AstraMentoringAPI.Controllers.MonitorActivitiesController(monitor);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => usersController.GetStats(cts.Token));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => monitorController.GetOverview(cancellationToken: cts.Token));
    }
}
