from app.database.database import engine, Base
from app import models


print("Création des tables...")

Base.metadata.create_all(bind=engine)

print("Tables créées avec succès !")