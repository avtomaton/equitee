from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text, Index
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy import func

Base = declarative_base()


class Property(Base):
    __tablename__ = 'properties'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False, default='Condo')
    province = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(String, nullable=False)
    postal_code = Column(String, nullable=False)
    parking = Column(String)
    purchase_price = Column(Float, nullable=False, default=0.0)
    market_price = Column(Float, nullable=False, default=0.0)
    loan_amount = Column(Float, nullable=False, default=0.0)
    monthly_rent = Column(Float, nullable=False, default=0.0)
    poss_date = Column(String, nullable=False)
    status = Column(String, nullable=False, default='Rented')
    expected_condo_fees = Column(Float, default=0.0)
    expected_insurance = Column(Float, default=0.0)
    expected_utilities = Column(Float, default=0.0)
    expected_misc_expenses = Column(Float, default=0.0)
    expected_appreciation_pct = Column(Float, default=0.0)
    annual_property_tax = Column(Float, default=0.0)
    mortgage_rate = Column(Float, default=0.0)
    mortgage_payment = Column(Float, default=0.0)
    mortgage_frequency = Column(String, default='monthly')
    notes = Column(Text)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    is_archived = Column(Boolean, default=False)

    # Relationships
    expenses = relationship("Expense", back_populates="property", cascade="all, delete-orphan")
    income_records = relationship("Income", back_populates="property", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="property", cascade="all, delete-orphan")
    tenants = relationship("Tenant", back_populates="property", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="property", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert model to dictionary (compatible with existing API format)"""
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'province': self.province,
            'city': self.city,
            'address': self.address,
            'postal_code': self.postal_code,
            'parking': self.parking,
            'purchase_price': self.purchase_price,
            'market_price': self.market_price,
            'loan_amount': self.loan_amount,
            'monthly_rent': self.monthly_rent,
            'poss_date': self.poss_date,
            'status': self.status,
            'expected_condo_fees': self.expected_condo_fees,
            'expected_insurance': self.expected_insurance,
            'expected_utilities': self.expected_utilities,
            'expected_misc_expenses': self.expected_misc_expenses,
            'expected_appreciation_pct': self.expected_appreciation_pct,
            'annual_property_tax': self.annual_property_tax,
            'mortgage_rate': self.mortgage_rate,
            'mortgage_payment': self.mortgage_payment,
            'mortgage_frequency': self.mortgage_frequency,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_archived': self.is_archived,
            # Calculated fields for backward compatibility
            'total_income': sum(i.amount for i in self.income_records),
            'total_expenses': sum(e.amount for e in self.expenses)
        }


class Expense(Base):
    __tablename__ = 'expenses'

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, ForeignKey('properties.id', ondelete='CASCADE'), nullable=False)
    expense_date = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    expense_type = Column(String, nullable=False)
    expense_category = Column(String, nullable=False)
    notes = Column(Text)
    tax_deductible = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    property = relationship("Property", back_populates="expenses")

    def to_dict(self):
        return {
            'id': self.id,
            'property_id': self.property_id,
            'expense_date': self.expense_date,
            'amount': self.amount,
            'expense_type': self.expense_type,
            'expense_category': self.expense_category,
            'notes': self.notes,
            'tax_deductible': self.tax_deductible,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Income(Base):
    __tablename__ = 'income'

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, ForeignKey('properties.id', ondelete='CASCADE'), nullable=False)
    income_date = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    income_type = Column(String, nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    property = relationship("Property", back_populates="income_records")

    def to_dict(self):
        return {
            'id': self.id,
            'property_id': self.property_id,
            'income_date': self.income_date,
            'amount': self.amount,
            'income_type': self.income_type,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Event(Base):
    __tablename__ = 'events'

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, ForeignKey('properties.id', ondelete='CASCADE'), nullable=False)
    column_name = Column(String, nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    description = Column(Text)
    created_at = Column(DateTime, default=func.now())

    # Relationship
    property = relationship("Property", back_populates="events")

    def to_dict(self):
        return {
            'id': self.id,
            'property_id': self.property_id,
            'column_name': self.column_name,
            'old_value': self.old_value,
            'new_value': self.new_value,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Tenant(Base):
    __tablename__ = 'tenants'

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, ForeignKey('properties.id', ondelete='CASCADE'), nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String)
    email = Column(String)
    notes = Column(Text)
    lease_start = Column(String, nullable=False)
    lease_end = Column(String)
    deposit = Column(Float, default=0.0)
    rent_amount = Column(Float, default=0.0)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    property = relationship("Property", back_populates="tenants")

    def to_dict(self):
        return {
            'id': self.id,
            'property_id': self.property_id,
            'name': self.name,
            'phone': self.phone,
            'email': self.email,
            'notes': self.notes,
            'lease_start': self.lease_start,
            'lease_end': self.lease_end,
            'deposit': self.deposit,
            'rent_amount': self.rent_amount,
            'is_archived': self.is_archived,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Document(Base):
    __tablename__ = 'documents'

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, ForeignKey('properties.id', ondelete='CASCADE'), nullable=False)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    doc_type = Column(String, nullable=False)
    notes = Column(Text)
    uploaded_at = Column(DateTime, default=func.now())

    # Relationship
    property = relationship("Property", back_populates="documents")

    def to_dict(self):
        return {
            'id': self.id,
            'property_id': self.property_id,
            'filename': self.filename,
            'original_filename': self.original_filename,
            'mime_type': self.mime_type,
            'size_bytes': self.size_bytes,
            'doc_type': self.doc_type,
            'notes': self.notes,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None
        }


# Database indexes - original indexes only (performance indexes managed by migration: add_missing_indexes)
Index('idx_expenses_property', Expense.property_id)
Index('idx_income_property', Income.property_id)
Index('idx_events_property', Event.property_id)
Index('idx_tenants_property', Tenant.property_id)
Index('idx_expenses_date', Expense.expense_date)
Index('idx_income_date', Income.income_date)
Index('idx_properties_archived', Property.is_archived)
# NOTE: The following performance indexes are managed by the Alembic migration
# 'add_missing_indexes' and are NOT declared here to avoid duplication:
#   idx_tenants_lease_end, idx_tenants_archived, idx_events_column,
#   idx_expenses_prop_date, idx_income_prop_date, idx_documents_property
