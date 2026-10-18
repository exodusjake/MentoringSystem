using System.Reflection;
using System.Text.Json;
using AstraMentoring_Backend.Services;

public class MonitoringMetadataTests
{
    [Theory]
    [InlineData(6, 0, 0, 0)]
    [InlineData(6, 1, 1, 1)]
    [InlineData(6, 1, 0, 0)]
    [InlineData(5, 1, 1, 0)]
    [InlineData(5, 5, 5, 2)]
    public void AuthoritativeSectionMetricsReplaceLegacyInitialValues(int required, int completed, int documents, int onTime)
    {
        var previous = new MentorOverviewDto { MentorID=303, MenteeCount=2, Sections="Synthetic", CompletedSessions=999, CompleteCount=999, OnTimeCount=999, SectionCount=999 };
        var metadataOnly = new MentorOverviewDto { MentorID=303, MenteeCount=2, Sections="Synthetic" };
        var sections = new List<MentorSectionProgressDto> { new() { MentorID=303, SectionCode="Synthetic", RequiredSessions=required, CompletedSessions=completed, CompleteCount=documents, OnTimeCount=onTime } };
        var apply = typeof(MonitorActivitiesService).GetMethod("ApplyCheckpointMetrics", BindingFlags.Static|BindingFlags.NonPublic)!;
        apply.Invoke(null, new object[] { previous, sections });
        apply.Invoke(null, new object[] { metadataOnly, sections });
        Assert.Equal(JsonSerializer.Serialize(previous), JsonSerializer.Serialize(metadataOnly));
        Assert.Equal(completed, metadataOnly.CompletedSessions);
        Assert.Equal(documents, metadataOnly.CompleteCount);
    }
}
