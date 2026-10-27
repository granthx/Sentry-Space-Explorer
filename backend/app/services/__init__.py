"""Business logic. Pure functions that fetch via NasaClient and normalise results.

Routers call services; later, the Phase 3 AI assistant calls the very same
services as its tools. Keep HTTP concerns (status codes, query parsing) out of here.
"""
