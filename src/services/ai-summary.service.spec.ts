import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiSummaryService } from './ai-summary.service';
import { ActivityData } from './ai-provider.service';
import { AiProviderService } from './ai-provider.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('AiSummaryService', () => {
  let service: AiSummaryService;
  let configService: ConfigService;

  const mockActivityData: ActivityData[] = [
    {
      id: 'test-1',
      type: 'gitlab',
      timestamp: '2025-06-15T10:00:00.000Z',
      title: 'Commit: Add new feature',
      description: 'Added new feature implementation',
      author: 'John Doe',
      url: 'https://gitlab.com/test/commit/123',
      metadata: {
        action: 'commit',
        shortId: 'abc123',
        projectName: 'test-project',
      },
    },
    {
      id: 'test-2',
      type: 'teams',
      timestamp: '2025-06-15T14:00:00.000Z',
      title: 'Calendar Event: Team Meeting',
      description: 'Weekly team sync meeting',
      author: 'Jane Smith',
      url: 'https://teams.microsoft.com/meeting',
      metadata: {
        action: 'calendar',
        duration: 60,
        isOnlineMeeting: true,
      },
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSummaryService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: AiProviderService,
          useValue: {
            generateSummary: jest.fn().mockResolvedValue('Mock AI summary'),
            getAvailableProviders: jest.fn().mockReturnValue(['openai']),
          },
        },
      ],
    }).compile();

    service = module.get<AiSummaryService>(AiSummaryService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateDailySummary', () => {
    it('should generate summary for activities', async () => {
      // Mock the loadActivitiesForDate method
      jest.spyOn(service as any, 'loadActivitiesForDate').mockResolvedValue(mockActivityData);

      const result = await service.generateDailySummary('2025-06-15');

      expect(result).toBeDefined();
      expect(result?.date).toBe('2025-06-15');
      expect(result?.activities).toEqual(mockActivityData);
      expect(result?.statistics.totalActivities).toBe(2);
      expect(result?.statistics.byType).toEqual({
        gitlab: 1,
        teams: 1,
      });
      expect(result?.statistics.byAuthor).toEqual({
        'John Doe': 1,
        'Jane Smith': 1,
      });
      expect(result?.aiSummary).toBe('Mock AI summary');
    });

    it('should return null for no activities', async () => {
      jest.spyOn(service as any, 'loadActivitiesForDate').mockResolvedValue([]);

      const result = await service.generateDailySummary('2025-06-15');

      expect(result).toBeNull();
    });
  });

  describe('generateWeeklySummary', () => {
    it('should generate summaries for date range', async () => {
      jest.spyOn(service as any, 'loadActivitiesForDate')
        .mockResolvedValueOnce(mockActivityData) // 2025-06-15
        .mockResolvedValueOnce([]) // 2025-06-16
        .mockResolvedValueOnce([mockActivityData[0]]); // 2025-06-17

      const result = await service.generateWeeklySummary('2025-06-15', '2025-06-17');

      expect(result).toHaveLength(2); // Only days with activities
      expect(result[0].date).toBe('2025-06-15');
      expect(result[1].date).toBe('2025-06-17');
    });
  });

  describe('loadActivitiesForDate', () => {
    it('should load activities from summary files', async () => {
      const mockFileData = {
        summaries: [
          {
            date: '2025-06-15',
            activities: mockActivityData,
            summary: {
              totalActivities: 2,
              byType: { gitlab: 1, teams: 1 },
              byAuthor: { 'John Doe': 1, 'Jane Smith': 1 },
            },
          },
        ],
      };

      mockFs.readdir.mockResolvedValue(['gitlab.summary.json', 'teams.summary.json'] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockFileData));

      const result = await (service as any).loadActivitiesForDate('2025-06-15');

      // Since both files return the same activities, expect the result to be mockActivityData twice
      expect(result).toEqual([...mockActivityData, ...mockActivityData]);
      expect(mockFs.readdir).toHaveBeenCalledWith(expect.stringContaining('output'));
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should handle missing files gracefully', async () => {
      mockFs.readdir.mockResolvedValue(['gitlab.summary.json'] as any);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await (service as any).loadActivitiesForDate('2025-06-15');

      expect(result).toEqual([]);
    });
  });

  describe('saveSummary', () => {
    it('should save JSON summary', async () => {
      const summary = {
        date: '2025-06-15',
        aiSummary: 'Test summary',
        activities: mockActivityData,
        statistics: {
          totalActivities: 2,
          byType: { gitlab: 1, teams: 1 },
          byAuthor: { 'John Doe': 1, 'Jane Smith': 1 },
        },
      };

      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await service.saveSummary(summary, 'json');

      expect(result).toContain('ai-summary-20250615.json');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ai-summary-20250615.json'),
        JSON.stringify(summary, null, 2),
        'utf-8'
      );
    });

    it('should save TXT summary', async () => {
      const summary = {
        date: '2025-06-15',
        aiSummary: 'Test summary content',
        activities: mockActivityData,
        statistics: {
          totalActivities: 2,
          byType: { gitlab: 1, teams: 1 },
          byAuthor: { 'John Doe': 1, 'Jane Smith': 1 },
        },
      };

      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await service.saveSummary(summary, 'txt');

      expect(result).toContain('ai-summary-20250615.txt');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ai-summary-20250615.txt'),
        'Test summary content',
        'utf-8'
      );
    });

    it('should save MD summary', async () => {
      const summary = {
        date: '2025-06-15',
        aiSummary: 'Test summary content',
        activities: mockActivityData,
        statistics: {
          totalActivities: 2,
          byType: { gitlab: 1, teams: 1 },
          byAuthor: { 'John Doe': 1, 'Jane Smith': 1 },
        },
      };

      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await service.saveSummary(summary, 'md');

      expect(result).toContain('ai-summary-20250615.md');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ai-summary-20250615.md'),
        expect.stringContaining('# Daily Activity Summary - 2025-06-15'),
        'utf-8'
      );
    });

    it('should throw error for invalid format', async () => {
      const summary = {
        date: '2025-06-15',
        aiSummary: 'Test summary',
        activities: mockActivityData,
        statistics: {
          totalActivities: 2,
          byType: { gitlab: 1, teams: 1 },
          byAuthor: { 'John Doe': 1, 'Jane Smith': 1 },
        },
      };

      await expect(service.saveSummary(summary, 'invalid' as any)).rejects.toThrow(
        'Unsupported format: invalid'
      );
    });
  });

  describe('generateTemplateSummary', () => {
    it('should generate template summary with activities', () => {
      const result = (service as any).generateTemplateSummary(mockActivityData, '2025-06-15');

      expect(result).toContain('Daily Activity Summary for 2025-06-15');
      expect(result).toContain('Total activities: 2');
      expect(result).toContain('Activity types: gitlab, teams');
      expect(result).toContain('Contributors: John Doe, Jane Smith');
      expect(result).toContain('🔧 gitlab: 1 activities');
      expect(result).toContain('👥 teams: 1 activities');
      expect(result).toContain('John Doe: 1 activities');
      expect(result).toContain('Jane Smith: 1 activities');
    });

    it('should handle empty activities', () => {
      const result = (service as any).generateTemplateSummary([], '2025-06-15');

      expect(result).toBe('No activities recorded for 2025-06-15.');
    });
  });

  describe('getTypeEmoji', () => {
    it('should return correct emojis for activity types', () => {
      expect((service as any).getTypeEmoji('gitlab')).toBe('🔧');
      expect((service as any).getTypeEmoji('slack')).toBe('💬');
      expect((service as any).getTypeEmoji('teams')).toBe('👥');
      expect((service as any).getTypeEmoji('jira')).toBe('📋');
      expect((service as any).getTypeEmoji('unknown')).toBe('📝');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return available providers', () => {
      const providers = service.getAvailableProviders();
      expect(providers).toContain('openai');
      // Note: Other providers depend on environment variables being set
    });
  });

  describe('Open WebUI Provider Integration', () => {
    it('should handle Open WebUI provider when configured', async () => {
      // Mock the aiProviderService to return openwebui as available
      const mockAiProviderService = {
        generateSummary: jest.fn().mockResolvedValue('Open WebUI generated summary'),
        getAvailableProviders: jest.fn().mockReturnValue(['openwebui']),
      };

      // Create a new service instance with the mock
      const testModule = await Test.createTestingModule({
        providers: [
          AiSummaryService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn() },
          },
          {
            provide: AiProviderService,
            useValue: mockAiProviderService,
          },
        ],
      }).compile();

      const testService = testModule.get<AiSummaryService>(AiSummaryService);

      // Mock the loadActivitiesForDate method
      jest.spyOn(testService as any, 'loadActivitiesForDate').mockResolvedValue(mockActivityData);

      const result = await testService.generateDailySummary('2025-06-15', 'openwebui');

      expect(result).toBeDefined();
      expect(result?.aiSummary).toBe('Open WebUI generated summary');
      expect(mockAiProviderService.generateSummary).toHaveBeenCalledWith(mockActivityData, '2025-06-15', 'openwebui');
    });
  });
});
