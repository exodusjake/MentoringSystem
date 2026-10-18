using System.Security.Claims;
using AstraMentoring_Backend.Services;
using AstraMentoringAPI.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace AstraMentoringAPI.Tests;

// Pure policy/controller tests. No host, configuration, connections or SQL.
public class AcademicPeriodStatusTests
{
    [Theory]
    [InlineData("2026-2027", "2nd Semester", "2026-2027", "1st Semester")]
    [InlineData("2027-2028", "1st Semester", "2026-2027", "2nd Semester")]
    [InlineData("2026-2027", "1st Semester", "2026-2027", "1st Semester")]
    public void ValidatesForwardAndUnchangedPeriods(string year, string semester, string oldYear, string oldSemester)
        => SettingsService.ValidatePeriodTransition(year, semester, oldYear, oldSemester);

    [Theory]
    [InlineData("2025-2026", "1st Semester", "2026-2027", "1st Semester")]
    [InlineData("2026-2027", "1st Semester", "2026-2027", "2nd Semester")]
    [InlineData("2026-2028", "1st Semester", "2026-2027", "1st Semester")]
    [InlineData("2026-2027", "Summer", "2026-2027", "2nd Semester")]
    [InlineData("2026-2027", "2nd Semester", "bad", "1st Semester")]
    public void RejectsUndefinedAndBackwardTransitions(string year, string semester, string oldYear, string oldSemester)
        => Assert.Throws<ArgumentException>(() => SettingsService.ValidatePeriodTransition(year, semester, oldYear, oldSemester));

    [Theory]
    [InlineData(false, "Draft", false, null, "2026-10-10T15:59:59Z", "Pending")]
    [InlineData(false, "Draft", false, null, "2026-10-10T16:00:00Z", "Overdue")]
    [InlineData(false, "Submitted", true, "2026-10-10T15:59:59Z", "2026-10-12T00:00:00Z", "Submitted On Time")]
    [InlineData(false, "Submitted", true, "2026-10-10T16:00:00Z", "2026-10-12T00:00:00Z", "Submitted Late")]
    [InlineData(true, "Draft", false, "2026-10-09T00:00:00Z", "2026-10-10T15:59:59Z", "Needs Update")]
    [InlineData(true, "Draft", false, "2026-10-09T00:00:00Z", "2026-10-10T16:00:00Z", "Needs Update — Overdue")]
    [InlineData(false, "Submitted", false, "2026-10-09T00:00:00Z", "2026-10-12T00:00:00Z", "Overdue")]
    public void ClassifiesReportsAtInclusivePhilippineBoundary(bool update, string logStatus, bool complete, string? submitted, string now, string expected)
        => Assert.Equal(expected, CheckpointReportStatusPolicy.Classify(update, logStatus, complete,
            submitted == null ? null : DateTimeOffset.Parse(submitted), DateTimeOffset.Parse("2026-10-11T00:00:00+08:00"), DateTimeOffset.Parse(now)));

    [Fact]
    public void DoesNotInventMissingDeadlineOrNumericalPenalty()
    {
        var now = DateTimeOffset.UtcNow;
        Assert.Equal("Pending", CheckpointReportStatusPolicy.Classify(false,"Draft",false,null,null,now));
        Assert.Equal("Needs Update", CheckpointReportStatusPolicy.Classify(true,"Draft",false,now,null,now));
        Assert.Equal("Submitted — deadline unavailable", CheckpointReportStatusPolicy.Classify(false,"Submitted",true,now,null,now));
    }

    [Fact]
    public async Task RejectsAnotherMentorsReportHistoryBeforeServiceAccess()
    {
        var controller = new MonitorActivitiesController(null!);
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier,"10"),new Claim(ClaimTypes.Role,"Mentor") },"test")) }};
        Assert.IsType<ForbidResult>(await controller.GetReportStatuses(11,"2025-2026","1st Semester"));
    }

    [Theory]
    [InlineData("SchoolYear")]
    [InlineData("Semester")]
    public async Task RejectsSplitPeriodUpdatesBeforeServiceAccess(string key)
        => Assert.IsType<BadRequestObjectResult>(await new SettingsController(null!).Update(key,new UpdateSettingRequest {Value="ignored"}));
}
