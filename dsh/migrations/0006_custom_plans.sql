-- 0.8.0：用户自己维护的训练计划。weeks 是按周的课表 JSON：[[{kind,title,detail}, ...], ...]；days 是默认训练日（1=周一…7=周日）。
CREATE TABLE IF NOT EXISTS custom_plans (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'run',
  level       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  days        TEXT NOT NULL DEFAULT '[]',
  weeks       TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 比赛成绩分枪声成绩（official_s，原「官方成绩」）和净计时成绩（net_s）；个人最好成绩优先用净计时。
ALTER TABLE races ADD COLUMN net_s REAL;

-- 计划来源（自己 / UP 主 / 教练 / 书籍 / 其他，带名称和主页链接）与关联视频；每节课可挂一个视频，排进日历后带过去。
ALTER TABLE custom_plans ADD COLUMN source TEXT NOT NULL DEFAULT '{}';
ALTER TABLE custom_plans ADD COLUMN videos TEXT NOT NULL DEFAULT '[]';
ALTER TABLE calendar_items ADD COLUMN video TEXT NOT NULL DEFAULT '';

-- 推荐视频库：用户自己收录的训练视频（只存链接，点击在新窗口打开）。
CREATE TABLE IF NOT EXISTS videos (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  creator      TEXT NOT NULL DEFAULT '',
  creator_url  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'run',
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
