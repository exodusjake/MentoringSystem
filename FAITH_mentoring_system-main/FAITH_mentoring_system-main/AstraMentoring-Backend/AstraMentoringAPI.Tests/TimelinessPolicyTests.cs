using System.Reflection;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Tests;

public class TimelinessPolicyTests
{
    [Theory]
    [InlineData("1st Semester", 6)]
    [InlineData("2nd Semester", 5)]
    public void UsesSharedSemesterRequirement(string semester, int expected)
        => Assert.Equal(expected, CheckpointWindowPolicy.RequiredCheckpointCount(semester));
    // Pure grading tests: no application host, configuration or database.
    [Theory]
    [InlineData(0, 6, 25)]
    [InlineData(1, 6, 21)]
    [InlineData(2, 6, 21)]
    [InlineData(3, 6, 19)]
    [InlineData(4, 6, 11)]
    [InlineData(5, 6, 11)]
    [InlineData(6, 6, 7)]
    [InlineData(4, 5, 11)]
    [InlineData(5, 5, 7)]
    public void UsesFullSemesterAndAllLatePrecedence(int late, int required, double expected)
    {
        var method = typeof(MonitorActivitiesService).GetMethod("ComputeTimelinessScore", BindingFlags.NonPublic | BindingFlags.Static)!;
        Assert.Equal(expected, (double)method.Invoke(null, new object[] { late, required })!);
    }

    [Theory]
    [InlineData(5, 6, 6, 6, 80, 76)]
    [InlineData(6, 6, 6, 6, 80, 72)]
    [InlineData(5, 5, 5, 5, 80, 72)]
    [InlineData(0, 6, 0, 6, 60, 55)]
    public void KeepsDocumentAndAdminEvaluationWeights(int late, int reports, int complete, int required, int rating, double expected)
    {
        var method = typeof(MonitorActivitiesService).GetMethod("ComputeOverallPercent", BindingFlags.NonPublic | BindingFlags.Static)!;
        double completeness = (double)complete / required * 100;
        Assert.Equal(expected, (double)method.Invoke(null, new object[] { late, reports, completeness, (decimal?)rating })!);
    }
}
