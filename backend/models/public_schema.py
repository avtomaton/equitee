"""
Public schema models — always live in the 'public' schema regardless of tenant routing.
These models are NOT affected by schema_translate_map.

Tables:
  - tenants: Tenant registry (id, name, schema_name, plan, etc.)
  - users: User accounts (linked to a tenant)
"""

import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text
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
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan", foreign_keys="User.tenant_id")

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
        ForeignKey('public.tenants.id', ondelete='CASCADE'),
        nullable=False,
    )
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, server_default='owner')
    is_active = Column(Boolean, nullable=False, server_default='true')
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant", back_populates="users", foreign_keys=[tenant_id])

    def to_dict(self):
        return {
            'id': self.id,
            'tenant_id': self.tenant_id,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
