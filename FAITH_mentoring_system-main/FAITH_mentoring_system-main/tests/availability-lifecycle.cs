// Transactional integration runner; all test writes roll back.
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using AstraMentoring_Backend.Services;
using System.Reflection;
var config=new ConfigurationBuilder().AddJsonFile(args[0]).Build();
using var conn=new SqlConnection(config.GetConnectionString("DefaultConnection"));await conn.OpenAsync();
using var tx=conn.BeginTransaction();
try {
 var ids=await conn.QuerySingleAsync(@"
 DECLARE @mentor int,@mentee int,@slot int,@request int,@session int;
 SELECT TOP(1) @mentor=MentorID,@mentee=MenteeID FROM MentorMentee WHERE IsActive=1;
 INSERT Availability(MentorID,AvailableDate,StartTime,EndTime,IsBooked,SlotName)
 VALUES(@mentor,CAST(GETDATE() AS date),'16:10',NULL,0,'Mentoring Assembly');
 SET @slot=SCOPE_IDENTITY();
 SELECT @mentor AS MentorID,@mentee AS MenteeID,@slot AS AvailabilityID;",transaction:tx);
 int slot=(int)ids.AvailabilityID,mentee=(int)ids.MenteeID,mentor=(int)ids.MentorID;
 var query=(string)typeof(AvailabilityWorkflowService).GetField("BookableSlotsSql",BindingFlags.NonPublic|BindingFlags.Static)!.GetRawConstantValue()!;
 async Task Check(bool expected) {
   var open=await conn.QueryAsync<int>(query,new{MenteeID=mentee},tx);
   if(open.Contains(slot)!=expected)throw new Exception("Slot eligibility mismatch");
 }
 await Check(true);
 var request=await conn.QuerySingleAsync<int>(@"INSERT SessionRequests(MenteeID,AvailabilityID,Purpose,Status,RequestedAt,RespondedAt)
 VALUES(@mentee,@slot,'Rollback test','Approved',GETDATE(),GETDATE());SELECT CAST(SCOPE_IDENTITY() AS int);",new{mentee,slot},tx);
 await Check(false); // Orphaned approved booking must not look open.
 var session=await conn.QuerySingleAsync<int>(@"INSERT Sessions(MentorID,SessionDate,Status,RequestID,SchoolYear,Semester,SlotName,QRCodeToken)
 VALUES(@mentor,GETDATE(),'Scheduled',@request,'test-lifecycle','test','Mentoring Assembly',CONVERT(nvarchar(36),NEWID()));SELECT CAST(SCOPE_IDENTITY() AS int);",new{mentor,request},tx);
 await Check(true);
 await conn.ExecuteAsync("UPDATE Sessions SET Status='Cancelled' WHERE SessionID=@session",new{session},tx);await Check(false);
 await conn.ExecuteAsync("UPDATE Sessions SET Status='Completed',TimeEnd=GETDATE() WHERE SessionID=@session",new{session},tx);await Check(false);
 var delete=typeof(SessionsService).GetMethod("DeleteSessionWithinTransactionAsync",BindingFlags.NonPublic|BindingFlags.Static)!;
 if(!await (Task<bool>)delete.Invoke(null,new object[]{conn,tx,session})!)throw new Exception("Deletion failed");
 var remaining=await conn.ExecuteScalarAsync<int>(@"SELECT (SELECT COUNT(*) FROM Sessions WHERE SessionID=@session)
 +(SELECT COUNT(*) FROM SessionRequests WHERE AvailabilityID=@slot)+(SELECT COUNT(*) FROM Availability WHERE AvailabilityID=@slot)",new{session,slot},tx);
 if(remaining!=0)throw new Exception("Linked slot/booking records were left behind");
 Console.WriteLine("PASS: open, orphaned, active, cancelled, finished eligibility; actual service deletion removes linked session, bookings and slot.");
} finally {tx.Rollback();Console.WriteLine("Fixture records rolled back.");}
