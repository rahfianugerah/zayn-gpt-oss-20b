from logging.config import fileConfig

from alembic import context

from db import Base, engine

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)

# The engine comes from the app, so migrations use the same DATABASE_URL and local-only check
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
