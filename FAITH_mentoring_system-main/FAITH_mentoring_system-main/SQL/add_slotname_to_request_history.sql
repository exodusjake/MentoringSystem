-- add_slotname_to_request_history.sql
--
-- A mentee's "Request History" card (Schedule Session page) showed date,
-- time, and status for a past slot request, but never which checkpoint it
-- was for ("After Midterms" etc.) — Availability.SlotName was simply never
-- selected here, even though the posting/booking flow has carried it since
-- add_slotname_to_availability.sql. Same class of gap as everywhere else
-- this session that showed a make-up session without its checkpoint name.
CREATE OR ALTER PROCEDURE dbo.sp_GetRequestHistoryForMentee
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        sr.RequestID, sr.Status, sr.Purpose, sr.RequestedAt, sr.RespondedAt,
        u.FirstName + ' ' + u.LastName AS MentorName,
        a.AvailableDate, a.StartTime, a.EndTime, a.SlotName
    FROM   dbo.SessionRequests sr
    INNER  JOIN dbo.Availability a ON a.AvailabilityID = sr.AvailabilityID
    INNER  JOIN dbo.Users u        ON u.UserID         = a.MentorID
    WHERE  sr.MenteeID = @MenteeID
    ORDER  BY sr.RequestedAt DESC;
END;
GO
