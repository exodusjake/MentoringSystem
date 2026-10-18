using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using AstraMentoringAPI.Controllers;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Security.Claims;

namespace AstraMentoringAPI.Tests;

public class SessionClassificationTests
{
    [Fact]
    public void SectionResolutionRejectsUnassignedOrAmbiguousSections()
    {
        Assert.Equal("BSIT 1A", SessionsService.ResolveRegularSection(new[] { "BSIT 1A" }, null));
        Assert.Equal("BSCS 2B", SessionsService.ResolveRegularSection(new[] { "BSIT 1A", "BSCS 2B" }, "bscs 2b"));
        Assert.Null(SessionsService.ResolveRegularSection(new[] { "BSIT 1A", "BSCS 2B" }, null));
        Assert.Equal("BSIT 1A", SessionsService.ResolveRegularSection(new[] { "BSIT 1A" }, "STALE LABEL"));
        Assert.Equal("BSIT 1A", SessionsService.ResolveRegularSection(new[] { " BSIT 1A ", "BSIT 1A" }, "—"));
        Assert.Null(SessionsService.ResolveRegularSection(new[] { "BSIT 1A", "BSCS 2B" }, "UNASSIGNED"));
        Assert.Null(SessionsService.ResolveRegularSection(Array.Empty<string>(), null));
    }

    [Theory]
    [InlineData(17, "After Prelims", "2026-2027", "1st Semester")]
    [InlineData(841, "Before Finals", "2027-2028", "2nd Semester")]
    public async Task ClientCannotCreateMakeupThroughLogSession(int mentor, string slot, string year, string semester)
    {
        var data = new Session { MentorID=mentor, RequestID=99, SlotName=slot, SchoolYear=year, Semester=semester };
        var controller = new SessionsController(null!, null!, null!) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, mentor.ToString()) }))
            }}
        };
        Assert.IsType<BadRequestObjectResult>(await controller.Post(data));
        var service = new SessionsService(null!, new ConfigurationBuilder().Build());
        Assert.Equal(SessionAddResult.InvalidRegularSession, await service.Add(data));
    }

}
