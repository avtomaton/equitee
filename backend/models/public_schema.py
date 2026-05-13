"""
Public schema models — always live in the 'public' schema regardless of tenant routing.
These models are NOT affected by schema_translate_map.

Tables:
  - tenants: Tenant registry (id, name, schema_name, plan, etc.)
  - users: User accounts (linked to a tenant, nullable for pre-approval)
  - tenancy_requests: User requests for new tenancies (admin approves)
  - tenant_memberships: Multi-tenant access control
"""

import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, relationship

PublicBase = declarative_base()


class Tenant(PublicBase):
    __tablename__ = 'tenants'
    __table_args__ = {'schema': 'public'}

    id = Column(String(36), primary_key=True)
    name = Column(String(200), nullable=False)
    schema_name = Column(String(100), unique=True, nullable=False)
    plan = Column(String(50), nullable=False, server_default='free')
    is_active = Column(Boolean, nullable=False, server_default='true')
    stripe_customer_id = Column(String(200))
    max_properties = Column(Integer, nullable=True)  # None = unlimited
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="tenant", foreign_keys="User.tenant_id")
    memberships = relationship("TenantMembership", back_populates="tenant", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'schema_name': self.schema_name,
            'plan': self.plan,
            'is_active': self.is_active,
            'max_properties': self.max_properties,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class User(PublicBase):
    __tablename__ = 'users'
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(
        String(36),
        ForeignKey('public.tenants.id', ondelete='SET NULL'),
        nullable=True,  # Nullable — users can exist before tenancy is approved
    )
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)  # Nullable for Google OAuth users
    role = Column(String(50), nullable=False, server_default='owner')
    is_active = Column(Boolean, nullable=False, server_default='true')
    is_admin = Column(Boolean, nullable=False, server_default='false')
    email_verified = Column(Boolean, nullable=False, server_default='false')
    email_verification_token = Column(String(255), nullable=True)
    email_verification_sent_at = Column(DateTime, nullable=True)
    google_id = Column(String(255), nullable=True, unique=True)
    active_tenant_id = Column(
        String(36),
        ForeignKey('public.tenants.id', ondelete='SET NULL'),
        nullable=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant", back_populates="users", foreign_keys=[tenant_id])
    active_tenant = relationship("Tenant", foreign_keys=[active_tenant_id])
    memberships = relationship("TenantMembership", back_populates="user", cascade="all, delete-orphan",
                               foreign_keys="TenantMembership.user_id")
    tenancy_requests = relationship("TenancyRequest", back_populates="user",
                                    cascade="all, delete-orphan",
                                    foreign_keys="TenancyRequest.user_id")

    def to_dict(self):
        return {
            'id': self.id,
            'tenant_id': self.tenant_id,
            'active_tenant_id': self.active_tenant_id,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'is_admin': self.is_admin,
            'email_verified': self.email_verified,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class TenancyRequest(PublicBase):
    __tablename__ = 'tenancy_requests'
    __table_args__ = {'schema': 'public'}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False)
    tenant_name = Column(String(200), nullable=False)
    status = Column(String(50), nullable=False, server_default='pending')
    # pending | approved | rejected
    admin_notes = Column(Text, nullable=True)
    resolved_by = Column(Integer, ForeignKey('public.users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="tenancy_requests", foreign_keys=[user_id])
    resolver = relationship("User", foreign_keys=[resolved_by])

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'tenant_name': self.tenant_name,
            'status': self.status,
            'admin_notes': self.admin_notes,
            'resolved_by': self.resolved_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
        }


class TenantMembership(PublicBase):
    __tablename__ = 'tenant_memberships'
    __table_args__ = (
        UniqueConstraint('user_id', 'tenant_id', name='ix_tenant_memberships_user_tenant'),
        {'schema': 'public'},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False)
    tenant_id = Column(String(36), ForeignKey('public.tenants.id', ondelete='CASCADE'), nullable=False)
    role = Column(String(50), nullable=False, server_default='member')
    # owner | member
    invited_by = Column(Integer, ForeignKey('public.users.id', ondelete='SET NULL'), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default='true')
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="memberships", foreign_keys=[user_id])
    tenant = relationship("Tenant", back_populates="memberships")
    inviter = relationship("User", foreign_keys=[invited_by])

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'tenant_id': self.tenant_id,
            'role': self.role,
            'invited_by': self.invited_by,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
