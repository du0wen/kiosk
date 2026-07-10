-- Custom SQL migration file, put your code below! --

-- P1 pages were public and their links may already be shared. Preserve that:
-- flip all pre-existing rows to 'public'. New rows (inserted after this migration)
-- keep the 'org' default from 0006.
UPDATE "pages" SET "visibility" = 'public';
