import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, like, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { help_articles } from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { HelpArticlesErrorKeyEnum } from './constants/help-articles.enums';

@Injectable()
export class HelpArticlesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }

  async getArticles(domain: string, category?: string, search?: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const conditions = [
        eq(help_articles.company_id, companyId),
        eq(help_articles.is_published, true),
      ];

      if (category) {
        conditions.push(eq(help_articles.category, category));
      }

      let articlesList = await this.db.query.help_articles.findMany({
        where: and(...conditions),
        orderBy: (table, { asc }) => [
          asc(table.order_index),
          asc(table.created_at),
        ],
      });

      if (search) {
        const query = search.toLowerCase();
        articlesList = articlesList.filter(
          (art) =>
            art.title.toLowerCase().includes(query) ||
            art.content.toLowerCase().includes(query) ||
            art.category.toLowerCase().includes(query),
        );
      }

      return articlesList;
    } catch (error) {
      throw new InternalServerErrorException(
        HelpArticlesErrorKeyEnum.FAILED_TO_FETCH_HELP_ARTICLES,
      );
    }
  }

  async getArticleById(id: string) {
    try {
      const article = await this.db.query.help_articles.findFirst({
        where: eq(help_articles.id, id),
      });

      if (!article) {
        throw new NotFoundException(`Help article with ID ${id} not found`);
      }

      // Increment view count asynchronously
      this.db
        .update(help_articles)
        .set({ view_count: (article.view_count || 0) + 1 })
        .where(eq(help_articles.id, id))
        .catch((err) => {
          new InternalServerErrorException(
            HelpArticlesErrorKeyEnum.FAILED_TO_FETCH_HELP_ARTICLE,
            {
              cause: err,
            },
          );
        });

      return article;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        HelpArticlesErrorKeyEnum.FAILED_TO_FETCH_HELP_ARTICLE,
      );
    }
  }

  async createArticle(
    domain: string,
    articleData: {
      title: string;
      content: string;
      category: string;
      order_index?: number;
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const slug = articleData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const [newArticle] = await this.db
        .insert(help_articles)
        .values({
          title: articleData.title,
          slug,
          content: articleData.content,
          category: articleData.category,
          order_index: articleData.order_index || 0,
          company_id: companyId,
        })
        .returning();

      return newArticle;
    } catch (error) {
      throw new InternalServerErrorException(
        HelpArticlesErrorKeyEnum.FAILED_TO_CREATE_HELP_ARTICLE,
      );
    }
  }

  async voteArticle(id: string, isHelpful: boolean) {
    try {
      const article = await this.db.query.help_articles.findFirst({
        where: eq(help_articles.id, id),
      });

      if (!article) {
        throw new NotFoundException(`Help article with ID ${id} not found`);
      }

      const updateData = isHelpful
        ? { helpful_count: (article.helpful_count || 0) + 1 }
        : { not_helpful_count: (article.not_helpful_count || 0) + 1 };

      const [updated] = await this.db
        .update(help_articles)
        .set(updateData)
        .where(eq(help_articles.id, id))
        .returning();

      return updated;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        HelpArticlesErrorKeyEnum.FAILED_TO_SUBMIT_VOTE,
      );
    }
  }
}
