#!/usr/bin/env python3
"""Paketerar app/ till en .ipk och skapar filerna för Homebrew Channel i release/.

  python3 build/build_ipk.py

release/ checkas in i repot; Homebrew Channel läser filerna direkt från GitHub:
  <id>_<version>_all.ipk  appen
  repo.json               app-källan som Homebrew Channel läser
  app-icon.png            ikonen som visas i Homebrew Channel
  description.html        beskrivningen som visas i Homebrew Channel
"""
import hashlib, io, json, os, shutil, tarfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
DIST = os.path.join(ROOT, "release")
GITHUB_REPO = "Neoorell/lg-hemskarm"

info = json.load(open(os.path.join(APP, "appinfo.json")))
app_id, version = info["id"], info["version"]


def tar_gz(entries):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tf:
        for arcname, src, data in entries:
            ti = tarfile.TarInfo(arcname)
            ti.uid = ti.gid = 0
            ti.uname = ti.gname = "root"
            ti.mtime = int(time.time())
            if src is None and data is None:
                ti.type, ti.mode = tarfile.DIRTYPE, 0o755
                tf.addfile(ti)
            else:
                if data is None:
                    data = open(src, "rb").read()
                ti.size = len(data)
                ti.mode = 0o755 if (src and os.access(src, os.X_OK)) else 0o644
                tf.addfile(ti, io.BytesIO(data))
    return buf.getvalue()


def build_ipk(out):
    prefix = "./usr/palm/applications/" + app_id
    entries = [("./usr", None, None), ("./usr/palm", None, None), ("./usr/palm/applications", None, None), (prefix, None, None)]
    for dirpath, dirnames, filenames in os.walk(APP):
        dirnames[:] = sorted(d for d in dirnames if d != "__pycache__")
        rel = os.path.relpath(dirpath, APP)
        if rel != ".":
            entries.append((prefix + "/" + rel, None, None))
        for f in sorted(filenames):
            if f.endswith(".pyc"):
                continue
            src = os.path.join(dirpath, f)
            entries.append((prefix + "/" + os.path.relpath(src, APP), src, None))

    control = ("Package: %s\nVersion: %s\nSection: misc\nPriority: optional\nArchitecture: all\n"
               "Installed-Size: %d\nMaintainer: Neoorell\nDescription: %s\n") % (
        app_id, version, sum(os.path.getsize(e[1]) for e in entries if e[1]) // 1024 + 1, info["title"])

    members = [
        ("debian-binary", b"2.0\n"),
        ("control.tar.gz", tar_gz([(".", None, None), ("./control", None, control.encode())])),
        ("data.tar.gz", tar_gz(entries)),
    ]
    with open(out, "wb") as f:
        f.write(b"!<arch>\n")
        for name, data in members:
            hdr = "%-16s%-12d%-6s%-6s%-8s%-10d`\n" % (name, int(time.time()), "0", "0", "100644", len(data))
            f.write(hdr.encode("ascii") + data)
            if len(data) % 2:
                f.write(b"\n")


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    ipk_name = "%s_%s_all.ipk" % (app_id, version)
    ipk = os.path.join(DIST, ipk_name)
    build_ipk(ipk)
    shutil.copy(os.path.join(APP, "largeIcon.png"), os.path.join(DIST, "app-icon.png"))

    short = "Egen hemskärm med bakgrundsbild, klocka, väder, HDMI och dina appar. Öppnas med HOME."
    with open(os.path.join(DIST, "description.html"), "w") as f:
        f.write("<p>%s</p>\n<p>Efter första installationen: kör "
                "<code>sh /media/developer/apps/usr/palm/applications/%s/setup/setup.sh</code> "
                "som root för att koppla HOME-knappen. Senare uppdateringar behöver inte det.</p>\n"
                "<p>Mer information: https://github.com/%s</p>\n" % (short, app_id, GITHUB_REPO))

    base = "https://raw.githubusercontent.com/%s/main/release/" % GITHUB_REPO
    manifest = {
        "id": app_id,
        "version": version,
        "type": "web",
        "title": info["title"],
        "appDescription": short,
        "iconUri": base + "app-icon.png",
        "sourceUrl": "https://github.com/" + GITHUB_REPO,
        "rootRequired": True,
        "ipkUrl": base + ipk_name,
        "ipkHash": {"sha256": hashlib.sha256(open(ipk, "rb").read()).hexdigest()},
        "ipkSize": os.path.getsize(ipk),
    }
    repo = {
        "paging": {"page": 1, "count": 1, "maxPage": 1, "itemsTotal": 1},
        "packages": [{
            "id": app_id,
            "title": info["title"],
            "shortDescription": short,
            "fullDescriptionUrl": base + "description.html",
            "iconUri": manifest["iconUri"],
            "manifest": manifest,
        }],
    }
    with open(os.path.join(DIST, "repo.json"), "w") as f:
        json.dump(repo, f, indent=2, ensure_ascii=False)
        f.write("\n")

    for name in sorted(os.listdir(DIST)):
        print("release/%-40s %8d bytes" % (name, os.path.getsize(os.path.join(DIST, name))))


if __name__ == "__main__":
    main()
