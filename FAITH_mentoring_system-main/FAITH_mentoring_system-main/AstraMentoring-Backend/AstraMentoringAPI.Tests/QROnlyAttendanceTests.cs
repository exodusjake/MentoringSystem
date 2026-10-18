using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using AstraMentoringAPI.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace AstraMentoringAPI.Tests;

public class QROnlyAttendanceTests
{
    // No database or live accounts: forbidden writes must fail before any storage access.
    private static AttendanceService Service() => new(null!, new ConfigurationBuilder().Build());

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task CannotCreatePresenceOrForgeScanTime(bool present, bool scanned)
    {
        var data = new Attendance { SessionID = 1, MenteeID = 2, IsPresent = present,
            ScannedAt = scanned ? DateTime.UtcNow : null };
        var controller = new AttendanceController(Service());
        Assert.IsType<BadRequestObjectResult>(await controller.Post(data));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Service().EnsureAbsentAsync(data));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void CannotManuallyChangePresence(bool present)
    {
        var controller = new AttendanceController(Service());
        Assert.IsType<BadRequestObjectResult>(controller.Put(1, new Attendance { IsPresent = present }));
    }

    [Fact]
    public void CannotDeleteRecordedAttendance()
    {
        Assert.IsType<BadRequestObjectResult>(new AttendanceController(Service()).Delete(1));
    }
}
