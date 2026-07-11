Place clear, front-facing face photos in this folder:

- person_a.jpg
- person_b.jpg

Then edit people.json and run:

  cd backend
  source .venv/bin/activate
  python -m scripts.seed_people

The live UI does not enroll people — it only detects/matches against MongoDB.
