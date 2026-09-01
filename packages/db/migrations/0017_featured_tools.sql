ALTER TABLE tools
  ADD COLUMN featured boolean NOT NULL DEFAULT false,
  ADD COLUMN featured_order integer;

ALTER TABLE tools
  ADD CONSTRAINT tools_featured_order_positive
  CHECK (featured_order IS NULL OR featured_order > 0);

CREATE INDEX tools_featured_catalog_idx
  ON tools (featured_order ASC, published_at DESC)
  WHERE featured = true AND status = 'published';
