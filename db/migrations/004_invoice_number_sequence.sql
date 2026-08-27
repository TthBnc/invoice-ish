-- Allocate public invoice numbers from one persistent, concurrency-safe sequence.
-- PostgreSQL sequences are shared by every app instance and retain their value
-- across restarts. Gaps are acceptable when a number is reserved but PDF
-- generation is abandoned or fails.

CREATE SEQUENCE IF NOT EXISTS invoice_number_sequence
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;
