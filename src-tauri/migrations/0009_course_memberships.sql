-- A video/download remains canonical; membership and focused study attribution are per course.
CREATE TABLE playlist_videos (
 playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
 position INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(playlist_id,video_id)
);
CREATE INDEX playlist_videos_video ON playlist_videos(video_id);
INSERT INTO playlist_videos(playlist_id,video_id,position)
 SELECT playlist_id,id,rowid FROM videos WHERE playlist_id IS NOT NULL;
ALTER TABLE study_logs ADD COLUMN course_id TEXT;
UPDATE study_logs SET course_id=(SELECT playlist_id FROM videos WHERE id=study_logs.video_id);
CREATE INDEX study_logs_course ON study_logs(course_id);
-- Keep the legacy canonical-owner FK safe when its course is deleted. The last membership
-- still has the app's intentional delete semantics, while another course retains shared data.
CREATE TRIGGER preserve_shared_video BEFORE DELETE ON playlists BEGIN
 UPDATE videos SET playlist_id=(SELECT pv.playlist_id FROM playlist_videos pv
  WHERE pv.video_id=videos.id AND pv.playlist_id<>OLD.id ORDER BY pv.playlist_id LIMIT 1)
 WHERE playlist_id=OLD.id AND EXISTS(SELECT 1 FROM playlist_videos pv
  WHERE pv.video_id=videos.id AND pv.playlist_id<>OLD.id);
END;
