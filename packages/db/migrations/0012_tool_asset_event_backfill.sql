INSERT INTO tool_asset_events (
  tool_id, actor_user_id, event_type, reason, metadata, created_at
)
SELECT
  tool.id,
  tool.created_by_user_id,
  'created',
  '',
  jsonb_build_object('backfilled', true, 'origin', tool.origin_type),
  tool.created_at
FROM tools tool
WHERE NOT EXISTS (
  SELECT 1
  FROM tool_asset_events event
  WHERE event.tool_id = tool.id
    AND event.event_type = 'created'
);

INSERT INTO tool_asset_events (
  tool_id, tool_version_id, actor_user_id, event_type,
  reason, metadata, created_at
)
SELECT
  version.tool_id,
  version.id,
  version.created_by_user_id,
  'version-published',
  version.change_summary,
  jsonb_build_object('backfilled', true),
  COALESCE(version.released_at, version.created_at)
FROM tool_versions version
WHERE version.status IN ('published', 'offline')
  AND NOT EXISTS (
    SELECT 1
    FROM tool_asset_events event
    WHERE event.tool_version_id = version.id
      AND event.event_type = 'version-published'
  );

INSERT INTO tool_asset_events (
  tool_id, tool_version_id, actor_user_id, event_type,
  reason, metadata, created_at
)
SELECT
  version.tool_id,
  version.id,
  version.created_by_user_id,
  'version-offline',
  COALESCE(version.offline_reason, '历史版本已下架'),
  jsonb_build_object('backfilled', true),
  COALESCE(version.offline_at, version.updated_at)
FROM tool_versions version
WHERE version.status = 'offline'
  AND NOT EXISTS (
    SELECT 1
    FROM tool_asset_events event
    WHERE event.tool_version_id = version.id
      AND event.event_type = 'version-offline'
  );
