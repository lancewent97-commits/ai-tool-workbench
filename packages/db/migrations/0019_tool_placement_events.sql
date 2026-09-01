ALTER TABLE tool_asset_events
  DROP CONSTRAINT IF EXISTS tool_asset_events_event_type_check;

ALTER TABLE tool_asset_events
  ADD CONSTRAINT tool_asset_events_event_type_check CHECK (event_type IN (
    'created',
    'metadata-updated',
    'version-created',
    'version-published',
    'version-offline',
    'tool-published',
    'tool-offline',
    'placement-updated'
  ));
