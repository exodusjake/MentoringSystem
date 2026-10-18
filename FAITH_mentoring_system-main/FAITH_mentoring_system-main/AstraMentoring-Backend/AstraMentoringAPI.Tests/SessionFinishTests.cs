using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using AstraMentoring_Backend.Services;
using AstraMentoringAPI.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.Security.Claims;

namespace AstraMentoringAPI.Tests;

public class SessionFinishTests
{
    [Fact]
    public async Task SchedulingRejectsManualEndTimeBeforeStorage()
    {
        Assert.IsType<BadRequestObjectResult>(await Controller(null).Post(new Session {
            MentorID=1, SessionDate=DateTime.UtcNow.AddDays(1), TimeEnd=DateTime.UtcNow }));
    }

    [Fact]
    public async Task SchedulingRejectsPastStartBeforeStorage()
    {
        Assert.IsType<BadRequestObjectResult>(await Controller(null).Post(new Session {
            MentorID=1, SessionDate=DateTime.UtcNow.AddDays(-1) }));
    }

    [Fact]
    public async Task EditCannotInsertAnEndTimeOrRescheduleIntoPast()
    {
        var existing = new Session { SessionID=1, MentorID=1, SessionDate=DateTime.UtcNow.AddDays(1) };
        Assert.IsType<BadRequestObjectResult>(await Controller(existing).Put(1,new Session {
            SessionDate=existing.SessionDate, TimeEnd=existing.SessionDate.AddHours(-1) }));
        Assert.IsType<BadRequestObjectResult>(await Controller(existing).Put(1,new Session {
            SessionDate=DateTime.UtcNow.AddDays(-1) }));
    }

    [Fact]
    public async Task EditCannotMarkSessionCompletedWithoutSaveEnd()
    {
        var existing = new Session { SessionID=1, MentorID=1, SessionDate=DateTime.UtcNow.AddDays(1) };
        var result = await Controller(existing).Put(1,new Session {
            SessionDate=existing.SessionDate, Status="Completed"
        });
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task CannotFinishAnotherMentorsSession()
    {
        var controller = Controller(new Session { SessionID=1, MentorID=2 });
        Assert.IsType<ForbidResult>(await controller.Finish(1));
    }

    [Fact]
    public async Task MissingSessionDoesNotAttemptToRecordEndTime()
    {
        Assert.IsType<NotFoundResult>(await Controller(null).Finish(1));
    }

    private static SessionsController Controller(Session? session)
    {
        var config = new ConfigurationBuilder().Build();
        return new SessionsController(new SessionsService(new Repository(session), config), config, null!) {
            ControllerContext = new ControllerContext { HttpContext=new DefaultHttpContext {
                User=new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier,"1") }))
            }}
        };
    }

    private sealed class Repository(Session? session) : IGenericRepository<Session>
    {
        public Task<Session?> GetByIdAsync(int id) => Task.FromResult(session);
        public Task<IEnumerable<Session>> GetAllAsync() => throw new NotSupportedException();
        public Task<bool> AddAsync(Session entity) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(Session entity) => throw new NotSupportedException();
        public Task<bool> DeleteAsync(int id) => throw new NotSupportedException();
        public IQueryable<Session> GetAll() => throw new NotSupportedException();
        public Task Create(Session entity) => throw new NotSupportedException();
    }
}
