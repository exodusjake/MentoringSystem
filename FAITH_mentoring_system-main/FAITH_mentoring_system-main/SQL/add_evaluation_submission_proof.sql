-- add_evaluation_submission_proof.sql
--
-- Evaluation Forms previously let a mentee "mark" a form submitted with a
-- plain button click -- entirely self-reported, no evidence attached (Admin's
-- modal even carried a disclaimer saying so). This adds a proof screenshot:
-- the upload itself is now what marks the form submitted (one step, no
-- separate confirm), and Admin/Head's submission-detail modal can show a
-- "View" link on what was actually uploaded.

ALTER TABLE dbo.EvaluationSubmissions ADD ProofFilePath NVARCHAR(255) NULL;
