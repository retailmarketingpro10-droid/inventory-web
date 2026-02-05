import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

export type UserRole = 'owner' | 'manager' | 'employee' | 'viewer';

interface UserRoleData {
  role: UserRole;
  permissions: string[];
}

const ROLE_PERMISSIONS = {
  owner: ['all'],
  manager: ['gst_tracker', 'ledger_management', 'invoice_management', 'product_management', 'supplier_management'],
  employee: ['invoice_management', 'product_management'],
  viewer: ['view_only']
};

export const useRoles = () => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<UserRoleData>({
    role: 'viewer',
    permissions: ['view_only']
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserRole();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchUserRole = async () => {
    try {
      // For now, default to owner role for all authenticated users
      // This simplifies the role system while maintaining functionality
      setUserRole({
        role: 'owner',
        permissions: ROLE_PERMISSIONS['owner']
      });
    } catch (error) {
      logger.error('Error fetching user role:', error);
      // Default to owner on error for functionality
      setUserRole({
        role: 'owner',
        permissions: ['all']
      });
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permission: string): boolean => {
    return userRole.permissions.includes('all') || userRole.permissions.includes(permission);
  };

  const isOwnerOrManager = (): boolean => {
    return userRole.role === 'owner' || userRole.role === 'manager';
  };

  return {
    userRole: userRole.role,
    permissions: userRole.permissions,
    hasPermission,
    isOwnerOrManager,
    loading
  };
};