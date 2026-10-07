"""
FastAPI application entry point.
Initializes the Helpdesk module with middleware, routes, and configuration.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.config import settings
import app.models  # noqa: F401  (register models with Base metadata)
from app.middleware.auth import AuthMiddleware


# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    debug=settings.DEBUG,
)

# CORS middleware
allowed_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication middleware
app.add_middleware(AuthMiddleware)


# Health check endpoint (no auth required)
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.API_VERSION,
        "environment": settings.API_ENV,
        "auth_mode": settings.AUTH_MODE,
    }


# Routes will be imported and included here
# TODO: Import route modules
# from app.routes import tickets, categories, comments, attachments, admin

# Include routers
# app.include_router(tickets.router)
# app.include_router(categories.router)
# app.include_router(comments.router)
# app.include_router(attachments.router)
# app.include_router(admin.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
    )
