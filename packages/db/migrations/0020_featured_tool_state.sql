ALTER TABLE tools
  ADD CONSTRAINT tools_featured_requires_published
  CHECK (featured = false OR status = 'published');
