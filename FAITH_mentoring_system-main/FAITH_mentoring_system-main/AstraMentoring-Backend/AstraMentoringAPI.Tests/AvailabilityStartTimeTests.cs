using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using AstraMentoring_Backend.Services;
using AstraMentoringAPI.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace AstraMentoringAPI.Tests;

public class AvailabilityStartTimeTests
{
    [Theory]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("-01:00")]
    [InlineData("1.01:00:00")]
    public async Task RejectsInvalidStartBeforeStorage(string start)
    {
        var controller = new AvailabilityWorkflowController(null!, null!, null!) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, "1") }))
            }}
        };
        Assert.IsType<BadRequestObjectResult>(await controller.PostSlot(1, new PostSlotRequest { StartTime = start }));
    }

    [Fact]
    public async Task LegacyWritesCannotStorePlannedEndTime()
    {
        var repo = new AvailabilityRepository();
        var service = new AvailabilityService(repo);
        var slot = new Availability { StartTime = TimeSpan.FromHours(9), EndTime = TimeSpan.FromHours(10) };
        await service.Add(slot);
        Assert.Null(repo.Saved!.EndTime);
        Assert.Equal(TimeSpan.FromHours(9), repo.Saved.StartTime);
        slot.EndTime = TimeSpan.FromHours(11);
        await service.Update(slot);
        Assert.Null(repo.Saved.EndTime);
    }

    private sealed class AvailabilityRepository : IGenericRepository<Availability>
    {
        public Availability? Saved;
        public Task<bool> AddAsync(Availability entity) { Saved = entity; return Task.FromResult(true); }
        public Task<bool> UpdateAsync(Availability entity) => AddAsync(entity);
        public Task<IEnumerable<Availability>> GetAllAsync() => throw new NotSupportedException();
        public Task<Availability?> GetByIdAsync(int id) => throw new NotSupportedException();
        public Task<bool> DeleteAsync(int id) => throw new NotSupportedException();
        public IQueryable<Availability> GetAll() => throw new NotSupportedException();
        public Task Create(Availability entity) => throw new NotSupportedException();
    }
}
