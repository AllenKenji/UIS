import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Custom Export Layouts', () => {
  let testUserId: number;
  let testLayoutId: number;

  beforeAll(async () => {
    // Create a test user for layout ownership
    await db.upsertUser({
      openId: 'test-layout-user',
      name: 'Test Layout User',
      email: 'layout@test.com',
    });
    const user = await db.getUserByOpenId('test-layout-user');
    testUserId = user!.id;
  });

  describe('createExportLayout', () => {
    it('should create a custom export layout', async () => {
      const layout = await db.createExportLayout({
        name: 'Test Executive Layout',
        description: 'Custom executive summary layout for testing',
        layoutType: 'custom',
        preferences: {
          includeCharts: true,
          includeMetrics: true,
          fontSize: 'medium',
          orientation: 'portrait',
          pageSize: 'A4',
        },
        createdBy: testUserId,
      });

      expect(layout).toBeDefined();
      expect(layout.name).toBe('Test Executive Layout');
      expect(layout.layoutType).toBe('custom');
      expect(layout.createdBy).toBe(testUserId);
      testLayoutId = layout.id;
    });

    it('should create layout with minimal data', async () => {
      const layout = await db.createExportLayout({
        name: 'Minimal Layout',
        layoutType: 'custom',
        createdBy: testUserId,
      });

      expect(layout).toBeDefined();
      expect(layout.name).toBe('Minimal Layout');
      expect(layout.description).toBeNull();
    });
  });

  describe('getExportLayouts', () => {
    it('should retrieve all layouts for a user', async () => {
      const layouts = await db.getExportLayouts(testUserId);

      expect(layouts).toBeDefined();
      expect(Array.isArray(layouts)).toBe(true);
      expect(layouts.length).toBeGreaterThanOrEqual(2);
      expect(layouts[0].createdBy).toBe(testUserId);
    });

    it('should return empty array for user with no layouts', async () => {
      const layouts = await db.getExportLayouts(99999);

      expect(layouts).toBeDefined();
      expect(Array.isArray(layouts)).toBe(true);
      expect(layouts.length).toBe(0);
    });

    it('should return layouts in descending order by creation date', async () => {
      const layouts = await db.getExportLayouts(testUserId);

      if (layouts.length > 1) {
        const firstDate = new Date(layouts[0].createdAt).getTime();
        const secondDate = new Date(layouts[1].createdAt).getTime();
        expect(firstDate).toBeGreaterThanOrEqual(secondDate);
      }
    });
  });

  describe('getExportLayoutById', () => {
    it('should retrieve a specific layout by ID', async () => {
      const layout = await db.getExportLayoutById(testLayoutId, testUserId);

      expect(layout).toBeDefined();
      expect(layout!.id).toBe(testLayoutId);
      expect(layout!.name).toBe('Test Executive Layout');
    });

    it('should return undefined for non-existent layout', async () => {
      const layout = await db.getExportLayoutById(99999, testUserId);

      expect(layout).toBeUndefined();
    });

    it('should return undefined when layout belongs to different user', async () => {
      const layout = await db.getExportLayoutById(testLayoutId, 99999);

      expect(layout).toBeUndefined();
    });
  });

  describe('updateExportLayout', () => {
    it('should update layout name and description', async () => {
      await db.updateExportLayout(testLayoutId, testUserId, {
        name: 'Updated Executive Layout',
        description: 'Updated description for testing',
      });

      const updated = await db.getExportLayoutById(testLayoutId, testUserId);
      expect(updated!.name).toBe('Updated Executive Layout');
      expect(updated!.description).toBe('Updated description for testing');
    });

    it('should update layout preferences', async () => {
      await db.updateExportLayout(testLayoutId, testUserId, {
        preferences: {
          includeCharts: false,
          includeMetrics: true,
          fontSize: 'large',
          orientation: 'landscape',
          pageSize: 'Letter',
        },
      });

      const updated = await db.getExportLayoutById(testLayoutId, testUserId);
      expect(updated!.preferences).toBeDefined();
      expect(updated!.preferences.fontSize).toBe('large');
      expect(updated!.preferences.orientation).toBe('landscape');
    });

    it('should not update layout for different user', async () => {
      const originalLayout = await db.getExportLayoutById(testLayoutId, testUserId);
      
      await db.updateExportLayout(testLayoutId, 99999, {
        name: 'Should Not Update',
      });

      const unchanged = await db.getExportLayoutById(testLayoutId, testUserId);
      expect(unchanged!.name).toBe(originalLayout!.name);
    });
  });

  describe('deleteExportLayout', () => {
    it('should delete a layout', async () => {
      // Create a layout to delete
      const layoutToDelete = await db.createExportLayout({
        name: 'Layout to Delete',
        layoutType: 'custom',
        createdBy: testUserId,
      });

      await db.deleteExportLayout(layoutToDelete.id, testUserId);

      const deleted = await db.getExportLayoutById(layoutToDelete.id, testUserId);
      expect(deleted).toBeUndefined();
    });

    it('should not delete layout belonging to different user', async () => {
      const layoutsBefore = await db.getExportLayouts(testUserId);
      const countBefore = layoutsBefore.length;

      await db.deleteExportLayout(testLayoutId, 99999);

      const layoutsAfter = await db.getExportLayouts(testUserId);
      expect(layoutsAfter.length).toBe(countBefore);
    });
  });

  describe('Layout Preferences', () => {
    it('should store and retrieve complex preferences', async () => {
      const complexPreferences = {
        includeCharts: true,
        includeMetrics: true,
        includeNarrative: false,
        fontSize: 'medium' as const,
        orientation: 'portrait' as const,
        pageSize: 'A4' as const,
        headerText: 'FDP Survey Report',
        footerText: 'Confidential',
        includeTimestamp: true,
        includePageNumbers: true,
      };

      const layout = await db.createExportLayout({
        name: 'Complex Preferences Layout',
        layoutType: 'custom',
        preferences: complexPreferences,
        createdBy: testUserId,
      });

      const retrieved = await db.getExportLayoutById(layout.id, testUserId);
      expect(retrieved!.preferences).toEqual(complexPreferences);
    });

    it('should handle empty preferences', async () => {
      const layout = await db.createExportLayout({
        name: 'No Preferences Layout',
        layoutType: 'custom',
        createdBy: testUserId,
      });

      expect(layout.preferences).toBeNull();
    });
  });
});
