from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
from app.core.database import get_db
from app.core.stacks import get_stack
from app.api.deps import get_current_user
from app.repositories.user_repo import UserRepo
from app.schemas.user_schemas import (
    UserResponse,
    SignInRequest,
    OnboardingCompleteRequest,
    UserUpdate,
)
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])

GITHUB_API = "https://api.github.com"


@router.post("/signin", response_model=UserResponse)
async def signin_with_github(
    signin_request: SignInRequest, 
    db: AsyncSession = Depends(get_db)
):
    """
    Sign in or create user with GitHub token.
    This should be called from NextAuth signIn callback.
    Stores encrypted GitHub token for future API calls.
    """
    try:
        # Verify token with GitHub
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API}/user",
                headers={
                    "Authorization": f"Bearer {signin_request.github_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                timeout=10.0,
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired GitHub token"
            )

        github_user = response.json()
        github_id = str(github_user["id"])

        user_repo = UserRepo(db)

        # Check if user exists
        user = await user_repo.get_by_github_id(github_id)

        if not user:
            # Create new user with encrypted GitHub token
            user = await user_repo.create(
                github_id=github_id,
                username=github_user.get("login"),
                email=github_user.get("email"),
                github_token=signin_request.github_token,  # Store encrypted token
            )
        else:
            # Update existing user's GitHub token (in case it was refreshed)
            await user_repo.update_github_token(github_id, signin_request.github_token)

        await db.commit()
        return user

    except HTTPException:
        await db.rollback()
        raise
    except httpx.TimeoutException:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="GitHub API request timed out"
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user.
    Now uses NextAuth JWT middleware with dependency injection.
    """
    return current_user


@router.post("/onboarding/complete", response_model=UserResponse)
async def complete_user_onboarding(
    onboarding_data: OnboardingCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Complete user onboarding and set preferences.
    Now uses NextAuth JWT middleware with dependency injection.
    """
    try:
        # Optional: Check if onboarding already completed
        # if current_user.onboarding_completed == 1:
        #     raise HTTPException(
        #         status_code=status.HTTP_400_BAD_REQUEST,
        #         detail="Onboarding already completed"
        #     )

        user_repo = UserRepo(db)
        updated_user = await user_repo.complete_onboarding(
            user=current_user,
            preferred_stack=onboarding_data.preferred_stack,
            preferred_language=get_stack(onboarding_data.preferred_stack).language,
            developer_level=onboarding_data.developer_level,
        )

        await db.commit()
        return updated_user

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error completing onboarding: {str(e)}"
        )


@router.patch("/me", response_model=UserResponse)
async def update_user(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update current authenticated user's profile information.
    """
    try:
        user_repo = UserRepo(db)

        # Get only the fields that were provided (exclude None values)
        update_data = body.model_dump(exclude_none=True)

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )

        # Update the user
        updated_user = await user_repo.update(
            user_id=current_user.id,
            **update_data
        )

        await db.commit()

        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found after update"
            )

        return updated_user

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating user: {str(e)}"
        )