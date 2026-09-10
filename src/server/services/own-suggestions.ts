import { transaction } from '../db';
import { suggestionColumns } from '../suggestion-projection';
import type { OwnSuggestionPage, OwnSuggestion } from '@/contracts';
export async function ownSuggestions(owner: string, page: number): Promise<OwnSuggestionPage> {
  return transaction(async (client) => {
    const event = (await client.query('SELECT phase FROM event WHERE id=1 FOR SHARE')).rows[0];
    const { rows } = await client.query<OwnSuggestion>(
      `SELECT ${suggestionColumns},s.status FROM suggestion s JOIN district d ON d.id=s.district_id WHERE s.participant_id=$1 AND s.status<>'deleted' ORDER BY s.created_at DESC,s.id LIMIT 13 OFFSET $2`,
      [owner, (page - 1) * 12],
    );
    return {
      items: rows.slice(0, 12),
      nextPage: rows.length > 12 ? page + 1 : null,
      phase: event.phase,
    };
  });
}
