// Integration runner: pass an isolated local test config and monitoring-fixture.sql.
// Requires Dapper, SqlClient and the backend project; fixture writes always roll back.
using Microsoft.Extensions.Configuration;
using Microsoft.Data.SqlClient;
using Dapper;
using AstraMentoring_Backend.Services;
using System.Reflection;
var score=typeof(MonitorActivitiesService).GetMethod("ComputeTimelinessScore",BindingFlags.NonPublic|BindingFlags.Static)!;
foreach(var (late,required,expected) in new[]{(0,6,25d),(1,6,21d),(2,6,21d),(3,6,19d),(4,6,11d),(5,6,11d),(6,6,7d),(4,5,11d),(5,5,7d)})
 if((double)score.Invoke(null,new object[]{late,required})! != expected) throw new Exception("Semester-specific rubric mismatch");
Console.WriteLine("PASS: six/five required reports and ALL-LATE precedence.");
var config = new ConfigurationBuilder().AddJsonFile(args[0]).Build();
var connection = new SqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection"));
if (connection.DataSource != @"(localdb)\MSSQLLocalDB"
    || !connection.InitialCatalog.StartsWith("AstraMentoring_Test_", StringComparison.Ordinal))
    throw new Exception("Only an isolated AstraMentoring_Test_* database on local MSSQLLocalDB is allowed.");
using var conn=new SqlConnection(connection.ConnectionString);
await conn.OpenAsync();
var query=(string)typeof(MonitorActivitiesService).GetField("SectionProgressSql",BindingFlags.NonPublic|BindingFlags.Static)!.GetRawConstantValue()!;
using(var tx=conn.BeginTransaction()) {
 try {
  var fixture=await conn.QuerySingleAsync(File.ReadAllText(args[1]),transaction:tx);
  int mentor=(int)fixture.MentorID; string section=(string)fixture.SectionCode;
  var parameters=new {MentorIds=new[]{mentor},SchoolYear="test-monitoring",Semester="test",RequiredSessions=6};
  async Task Check(int complete,int onTime) {
   var rows=await conn.QueryAsync<MentorSectionProgressDto>(query,parameters,tx);
   var row=rows.Single(r=>r.SectionCode==section);
   if(row.CompletedSessions!=1 || row.CompleteCount!=complete || row.OnTimeCount!=onTime)
    throw new Exception($"Metric mismatch: {row.CompletedSessions}/{row.CompleteCount}/{row.OnTimeCount}");
  }
  await Check(1,1);
  var today=DateTime.UtcNow.AddHours(8).Date;
  if(!await CheckpointWindowPolicy.CanScheduleAsync(conn,"Mentoring Assembly","test-monitoring","test",today,tx)) throw new Exception("Open window rejected");
  if(await CheckpointWindowPolicy.CanScheduleAsync(conn,"Before Finals","test-monitoring","test",today,tx)) throw new Exception("Unscheduled checkpoint allowed");
  if(await CheckpointWindowPolicy.CanScheduleAsync(conn,"Mentoring Assembly","test-monitoring","test",today.AddDays(3),tx)) throw new Exception("Outside window allowed");
  int sessionId=await conn.ExecuteScalarAsync<int>("SELECT TOP(1) SessionID FROM Sessions WHERE SchoolYear='test-monitoring' AND SectionCode IS NULL",transaction:tx);
  await conn.ExecuteAsync("UPDATE Sessions SET TimeEnd=NULL WHERE SessionID=@sessionId",new{sessionId},tx);
  if(!await CheckpointWindowPolicy.CanAttendAsync(conn,sessionId,tx)) throw new Exception("Open QR blocked");
  await conn.ExecuteAsync("UPDATE CalendarEvents SET StartDate=DATEADD(DAY,-3,GETDATE()),EndDate=DATEADD(DAY,-2,GETDATE()) WHERE SchoolYear='test-monitoring' AND EventType='Session Schedule'",transaction:tx);
  if(await CheckpointWindowPolicy.CanAttendAsync(conn,sessionId,tx)) throw new Exception("Closed QR allowed");
  if(await CheckpointWindowPolicy.CanScheduleAsync(conn,"Mentoring Assembly","test-monitoring","test",today,tx)) throw new Exception("Closed schedule allowed");
  var closedRows=(await conn.QueryAsync<MentorSectionProgressDto>(query,parameters,tx)).Single(r=>r.SectionCode==section);
  if(closedRows.CompletedSessions!=0 || closedRows.CompleteCount!=0) throw new Exception("Calendar edit retained official completion/documents");
  var windowSummarySql=(string)typeof(MonitorActivitiesService).GetField("CheckpointSummarySql",BindingFlags.NonPublic|BindingFlags.Static)!.GetRawConstantValue()!;
  var closedSummary=(await conn.QueryAsync(windowSummarySql,parameters,tx)).ToList();
  if(closedSummary.Count!=0) throw new Exception("Calendar edit retained payable attendance");
  await conn.ExecuteAsync("UPDATE CalendarEvents SET StartDate=DATEADD(DAY,-1,GETDATE()),EndDate=DATEADD(DAY,1,GETDATE()) WHERE SchoolYear='test-monitoring' AND EventType='Session Schedule'",transaction:tx);
  await conn.ExecuteAsync("UPDATE Sessions SET TimeEnd=GETDATE() WHERE SessionID=@sessionId",new{sessionId},tx);
  Console.WriteLine("PASS: operational windows/QR guard retained; raw history retained; official credit follows calendar edits.");
  var lateMethod=typeof(MonitorActivitiesService).GetMethod("GetLateReportsAsync",BindingFlags.NonPublic|BindingFlags.Static)!;
  async Task<int> LateCount() {
   var task=(Task<Dictionary<int,int>>)lateMethod.Invoke(null,new object[]{conn,new[]{mentor},"test-monitoring","test",tx})!;
   return (await task).GetValueOrDefault(mentor);
  }
  if(await LateCount()!=0) throw new Exception("Complete on-time Assembly incorrectly penalized");
  await conn.ExecuteAsync(@"INSERT CalendarEvents(Title,StartDate,EndDate,EventType,CreatedAt,IsPublished,SlotName,SchoolYear,Semester)
    VALUES('Test',DATEADD(DAY,1,GETDATE()),DATEADD(DAY,1,GETDATE()),'Deadline',GETDATE(),1,'Before Prelims','test-monitoring','test')",transaction:tx);
  if(await LateCount()!=0) throw new Exception("Future report counted late");
  await conn.ExecuteAsync("UPDATE CalendarEvents SET StartDate=DATEADD(DAY,-1,GETDATE()) WHERE SchoolYear='test-monitoring' AND SlotName='Before Prelims'",transaction:tx);
  if(await LateCount()!=0) throw new Exception("Never-submitted report counted as a late submission");
  Console.WriteLine("PASS: on-time assembly accepted, future report excluded, missing report remains distinct from late submission.");
  var summarySql=(string)typeof(MonitorActivitiesService).GetField("CheckpointSummarySql",BindingFlags.NonPublic|BindingFlags.Static)!.GetRawConstantValue()!;
  var summaries=(await conn.QueryAsync(summarySql,parameters,tx)).ToList();
  if(summaries.Count!=1 || !(bool)summaries[0].Completed || (int)summaries[0].Attendees!=1) throw new Exception("Make-up checkpoint summary mismatch");
  await conn.ExecuteAsync("UPDATE CheckpointLogs SET NeedsUpdate=1 WHERE SchoolYear='test-monitoring' AND MentorID=@mentor",new{mentor},tx);
  await Check(0,0);
  await conn.ExecuteAsync("UPDATE CheckpointLogs SET NeedsUpdate=0,SubmittedAt=GETDATE() WHERE SchoolYear='test-monitoring' AND MentorID=@mentor",new{mentor},tx);
  await Check(1,0);
  await conn.ExecuteAsync(@"INSERT Sessions(MentorID,SessionDate,Status,SectionCode,SchoolYear,Semester,SlotName,QRCodeToken)
    VALUES(@mentor,GETDATE(),'Completed',@section,'test-monitoring','test','Mentoring Assembly',CONVERT(nvarchar(36),NEWID())),
          (@mentor,GETDATE(),'Completed',@section,'test-monitoring','other','Before Prelims',CONVERT(nvarchar(36),NEWID())),
          (@mentor,GETDATE(),'Cancelled',@section,'test-monitoring','test','Before Prelims',CONVERT(nvarchar(36),NEWID()));",new{mentor,section},tx);
  await Check(1,0);
  await conn.ExecuteAsync(@"INSERT Attendance(SessionID,MenteeID,IsPresent,ScannedAt)
    SELECT TOP(1) s.SessionID,a.MenteeID,1,GETUTCDATE() FROM Sessions s
    CROSS JOIN Attendance a JOIN Sessions original ON original.SessionID=a.SessionID
    WHERE s.MentorID=@mentor AND s.SchoolYear='test-monitoring' AND s.SectionCode=@section
      AND s.SlotName='Mentoring Assembly' AND original.SchoolYear='test-monitoring'
      AND original.SectionCode IS NULL",new{mentor,section},tx);
  summaries=(await conn.QueryAsync(summarySql,parameters,tx)).ToList();
  if(summaries.Count!=1 || (int)summaries[0].Attendees!=1) throw new Exception("Repeated attendee counted twice");
  Console.WriteLine("PASS: checkpoint Done and unique attendees across regular and make-up sessions.");
  Console.WriteLine("PASS: make-up-only completion/submission, Needs Update, late resubmission, deduplication, period and cancellation isolation.");
 } finally {tx.Rollback();Console.WriteLine("All fixture records rolled back.");}
}
var service=new MonitorActivitiesService(config,new EvaluationRatingsService(config));
var overview=await service.GetMentorOverviewAsync();
foreach(var mentor in overview.Mentors.Take(3)) {
 var detail=await service.GetMentorDetailAsync(mentor.MentorID);
 if(detail==null || detail.CompletedSessions!=mentor.CompletedSessions || detail.RequiredSessions!=mentor.RequiredSessions
    || detail.CompletenessPercent!=mentor.CompletenessPercent || detail.OverallPercent!=mentor.OverallPercent)
   throw new Exception("Overview/detail mismatch");
}
Console.WriteLine("PASS: isolated test database overview/detail totals and scores agree.");
