import { transaction } from '../db';
import { HttpError } from '../errors';
import { assignCategories } from '../categories';
import type { readSuggestionForm } from '../suggestion-input';

type Actor = { owner: string; adminId?: never } | { adminId: string; owner?: never };

/** Lock phase transitions and moderation together; never trust client ownership or phase. */
export async function editSuggestion(
  actor: Actor,
  id: string,
  input: Awaited<ReturnType<typeof readSuggestionForm>>,
) {
  return transaction(async (client) => {
    const event = (
      await client.query('SELECT phase,method,auto_approve FROM event WHERE id=1 FOR UPDATE')
    ).rows[0];
    const suggestion = (
      await client.query(
        'SELECT participant_id,status,cost FROM suggestion WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (
      !suggestion ||
      suggestion.status === 'deleted' ||
      (actor.owner && suggestion.participant_id !== actor.owner)
    )
      throw new HttpError(404, 'Suggestion not found.');
    if (actor.owner && event.phase !== 'suggestions')
      throw new HttpError(
        409,
        'Your suggestions are locked now. Only administrators can edit them.',
      );
    if (
      event.method === 'cumulative' &&
      suggestion.cost !== input.cost &&
      (await client.query('SELECT 1 FROM ballot LIMIT 1')).rowCount
    )
      throw new HttpError(
        409,
        'Project costs are locked after cumulative voting starts. Other details can still be edited by administrators.',
      );
    if (!(await client.query('SELECT 1 FROM district WHERE id=$1', [input.districtId])).rowCount)
      throw new HttpError(400, 'Choose a valid district.');
    await assignCategories(client, id, input.categoryIds);
    // An owner edit requires review again; hidden ideas cannot bypass an admin's decision.
    const status =
      actor.adminId || suggestion.status === 'hidden'
        ? suggestion.status
        : event.auto_approve
          ? 'approved'
          : 'pending';
    await client.query(
      'UPDATE suggestion SET title=$2,description=$3,district_id=$4,cost=$5,status=$6 WHERE id=$1',
      [id, input.title, input.description, input.districtId, input.cost, status],
    );
    if (input.image !== undefined)
      await client.query(
        'UPDATE suggestion SET image=$2,image_type=$3,image_url=NULL WHERE id=$1',
        [id, input.image, input.image ? 'image/webp' : null],
      );
    // Omitted fields preserve legacy clients' locations; explicit blanks clear them.
    if (input.location !== undefined)
      await client.query('UPDATE suggestion SET location=$2 WHERE id=$1', [id, input.location]);
    if (input.latitude !== undefined)
      await client.query('UPDATE suggestion SET latitude=$2,longitude=$3 WHERE id=$1', [
        id,
        input.latitude,
        input.longitude,
      ]);
    await client.query(
      'UPDATE ballot SET expires_at=now() WHERE submitted_at IS NULL AND $1::uuid=ANY(suggestion_ids)',
      [id],
    );
    if (actor.adminId)
      await client.query(
        "INSERT INTO admin_audit(admin_id,action,details) VALUES($1,'suggestion.content_updated',$2)",
        [
          actor.adminId,
          JSON.stringify({
            id,
            fields: [
              'title',
              'description',
              'district',
              'cost',
              'categories',
              ...(input.location !== undefined ? ['location'] : []),
              ...(input.latitude !== undefined ? ['latitude', 'longitude'] : []),
              ...(input.image !== undefined ? ['image'] : []),
            ],
          }),
        ],
      );
    return { id, status };
  });
}
