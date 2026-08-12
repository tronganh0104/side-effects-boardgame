import { afterEach, describe, expect, it } from 'vitest'
import { io as connectClient, type Socket } from 'socket.io-client'
import { createGameServer } from '../app'
import { hasCardConservation } from '../../src/game/engine/invariants'
import type { DisorderId } from '../../src/game/cards/types'

type Session = { roomId: string; playerId: string; sessionToken: string }
type GameView = { players: Array<{ id: string; hand?: Array<{ instanceId: string }>; handCount: number }>; pendingDecision?: { id: string; chooserPlayerId: string; choices?: Array<{ id: string; label: string }> } }

function once<T>(socket: Socket, event: string) {
  return new Promise<T>((resolve) => socket.once(event, resolve))
}

describe('socket Episode interactions', () => {
  const servers: ReturnType<typeof createGameServer>[] = []
  const clients: Socket[] = []

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect())
    await Promise.all(servers.splice(0).map(({ httpServer, io }) => new Promise<void>((resolve) => {
      io.close(); httpServer.close(() => resolve())
    })))
  })

  async function room() {
    const server = createGameServer({ port: 0, clientOrigins: ['http://localhost:5173'] })
    servers.push(server)
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve))
    const address = server.httpServer.address() as { port: number }
    const connect = async () => {
      const socket = connectClient(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] })
      clients.push(socket); await once(socket, 'connect'); return socket
    }
    const a = await connect(); const aSessionWait = once<Session>(a, 'session:restored')
    a.emit('room:create', { displayName: 'Ada' }); const aSession = await aSessionWait
    const b = await connect(); const bSessionWait = once<Session>(b, 'session:restored')
    b.emit('room:join', { roomId: aSession.roomId, displayName: 'Ben' }); const bSession = await bSessionWait
    const startedA = once<GameView>(a, 'game:state'); const startedB = once<GameView>(b, 'game:state')
    a.emit('room:start'); await Promise.all([startedA, startedB])
    return { server, a, b, aSession, bSession }
  }

  function arrange(server: ReturnType<typeof createGameServer>, roomId: string, disorderId: DisorderId) {
    const room = server.rooms.getRoom(roomId)!; const game = room.gameState!
    const attacker = game.players.find((player) => player.name === 'Ada')!
    const target = game.players.find((player) => player.name === 'Ben')!
    const episode = game.drawPile.find((card) => card.cardType === 'episode')!
    const disorder = game.drawPile.find((card): card is typeof game.players[number]['psyche']['slots'][number]['disorder'] => card.cardType === 'disorder' && card.definitionId === disorderId)!
    const replacedHand = attacker.hand[0]; const replacedDisorder = target.psyche.slots[0].disorder
    room.gameState = {
      ...game, currentPlayerIndex: game.players.indexOf(attacker), currentPlayerId: attacker.id,
      turn: { ...game.turn, currentPlayerId: attacker.id, phase: 'play', cardsPlayedThisTurn: 0, cardsDrawnThisTurn: 2 },
      players: game.players.map((player) => player.id === attacker.id ? { ...player, hand: [episode, ...player.hand.slice(1)] } : player.id === target.id ? { ...player, psyche: { slots: [{ disorder }, ...player.psyche.slots.slice(1)] } } : player),
      drawPile: [replacedHand, replacedDisorder, ...game.drawPile.filter((card) => card.instanceId !== episode.instanceId && card.instanceId !== disorder.instanceId)],
    }
    return { room, attacker, target, episode, disorder }
  }

  it('resolves Tremors over Socket.IO with private choices, validation, and conservation', async () => {
    const { server, a, b, aSession } = await room(); const prepared = arrange(server, aSession.roomId, 'tremors')
    const aViewWait = once<GameView>(a, 'game:state'); const bViewWait = once<GameView>(b, 'game:state')
    a.emit('game:command', { type: 'playEpisode', episodeCardId: prepared.episode.instanceId, targetPlayerId: prepared.target.id, targetDisorderCardId: prepared.disorder.instanceId })
    const [aView, bView] = await Promise.all([aViewWait, bViewWait]); const pending = bView.pendingDecision!
    expect(pending.chooserPlayerId).toBe(prepared.target.id); expect(pending.choices).toHaveLength(prepared.target.hand.length)
    expect(aView.pendingDecision?.choices).toBeUndefined(); expect(JSON.stringify(aView)).not.toContain(prepared.target.hand[0].instanceId)
    const wrong = once<string>(a, 'game:error'); a.emit('game:decision', { decisionId: pending.id, choiceIds: pending.choices!.slice(0, 3).map((choice) => choice.id) }); await expect(wrong).resolves.toContain('cannot resolve')
    const count = once<string>(b, 'game:error'); b.emit('game:decision', { decisionId: pending.id, choiceIds: pending.choices!.slice(0, 2).map((choice) => choice.id) }); await expect(count).resolves.toContain('exactly 3')
    const duplicate = once<string>(b, 'game:error'); b.emit('game:decision', { decisionId: pending.id, choiceIds: [pending.choices![0].id, pending.choices![0].id, pending.choices![1].id] }); await expect(duplicate).resolves.toContain('distinct')
    const resolved = once<GameView>(b, 'game:state'); b.emit('game:decision', { decisionId: pending.id, choiceIds: pending.choices!.slice(0, 3).map((choice) => choice.id) }); await resolved
    const game = server.rooms.getRoom(aSession.roomId)!.gameState!
    expect(server.rooms.getRoom(aSession.roomId)!.pendingDecision).toBeUndefined(); expect(game.discardPile).toContainEqual(prepared.episode); expect(game.players.find((p) => p.id === prepared.target.id)!.hand).toHaveLength(prepared.target.hand.length - 3); expect(game.turn.cardsPlayedThisTurn).toBe(1); expect(hasCardConservation(game)).toBe(true)
  })

  it('resolves Anxiety over Socket.IO without leaking target hand identities', async () => {
    const { server, a, b, aSession } = await room(); const prepared = arrange(server, aSession.roomId, 'anxiety')
    const aViewWait = once<GameView>(a, 'game:state'); const bViewWait = once<GameView>(b, 'game:state')
    a.emit('game:command', { type: 'playEpisode', episodeCardId: prepared.episode.instanceId, targetPlayerId: prepared.target.id, targetDisorderCardId: prepared.disorder.instanceId })
    const [aView, bView] = await Promise.all([aViewWait, bViewWait]); const pending = aView.pendingDecision!
    expect(pending.chooserPlayerId).toBe(prepared.attacker.id); expect(pending.choices?.map((c) => c.label)).toEqual(prepared.target.hand.map((_, i) => `Lá bài ${i + 1}`)); expect(JSON.stringify(pending)).not.toContain(prepared.target.hand[0].instanceId); expect(bView.pendingDecision?.choices).toBeUndefined()
    const wrong = once<string>(b, 'game:error'); b.emit('game:decision', { decisionId: pending.id, choiceIds: [pending.choices![0].id] }); await expect(wrong).resolves.toContain('cannot resolve')
    const resolved = once<GameView>(a, 'game:state'); a.emit('game:decision', { decisionId: pending.id, choiceIds: [pending.choices![0].id] }); await resolved
    const game = server.rooms.getRoom(aSession.roomId)!.gameState!; expect(game.turn.cardsPlayedThisTurn).toBe(1); expect(game.discardPile).toContainEqual(prepared.episode); expect(hasCardConservation(game)).toBe(true)
  })

  it('restores Tremors pending state to a replacement socket and rejects the stale socket', async () => {
    const { server, a, b, aSession, bSession } = await room(); const prepared = arrange(server, aSession.roomId, 'tremors')
    const pendingView = once<GameView>(b, 'game:state'); a.emit('game:command', { type: 'playEpisode', episodeCardId: prepared.episode.instanceId, targetPlayerId: prepared.target.id, targetDisorderCardId: prepared.disorder.instanceId })
    const pending = (await pendingView).pendingDecision!
    const address = server.httpServer.address() as { port: number }; const replacement = connectClient(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] }); clients.push(replacement); await once(replacement, 'connect')
    const restored = once<Session>(replacement, 'session:restored'); const restoredGame = once<GameView>(replacement, 'game:state'); replacement.emit('session:resume', bSession); await restored; const replacementView = await restoredGame
    expect(replacementView.pendingDecision?.id).toBe(pending.id)
    const stale = once<string>(b, 'game:error'); b.emit('game:decision', { decisionId: pending.id, choiceIds: pending.choices!.slice(0, 3).map((c) => c.id) }); await expect(stale).resolves.toContain('no longer active')
    const resolved = once<GameView>(replacement, 'game:state'); replacement.emit('game:decision', { decisionId: pending.id, choiceIds: pending.choices!.slice(0, 3).map((c) => c.id) }); await resolved
    const game = server.rooms.getRoom(aSession.roomId)!.gameState!; expect(server.rooms.getRoom(aSession.roomId)!.pendingDecision).toBeUndefined(); expect(game.players.find((p) => p.id === prepared.target.id)!.hand).toHaveLength(prepared.target.hand.length - 3); expect(game.turn.cardsPlayedThisTurn).toBe(1); expect(hasCardConservation(game)).toBe(true)
  })

  it.each(['suicidal-thoughts', 'tremors', 'gambling-addiction', 'anxiety'] as DisorderId[])('closes an active trade before %s can mutate the target hand', async (disorderId) => {
    const { server, a, b, aSession } = await room(); const prepared = arrange(server, aSession.roomId, disorderId)
    const invited = once<unknown>(b, 'trade:state'); a.emit('trade:invite', { targetPlayerId: prepared.target.id }); await invited
    const accepted = once<unknown>(a, 'trade:state'); b.emit('trade:accept'); await accepted
    const placed = once<unknown>(a, 'trade:state'); b.emit('trade:place', { cardInstanceId: prepared.target.hand[0].instanceId }); await placed
    const closed = once<{ reason: string }>(b, 'trade:closed'); const gameState = once<GameView>(b, 'game:state')
    a.emit('game:command', { type: 'playEpisode', episodeCardId: prepared.episode.instanceId, targetPlayerId: prepared.target.id, targetDisorderCardId: prepared.disorder.instanceId })
    await Promise.all([closed, gameState]); const roomState = server.rooms.getRoom(aSession.roomId)!; expect(roomState.pendingDecision?.kind).toBe(disorderId === 'tremors' ? 'tremors' : disorderId === 'anxiety' ? 'anxiety' : undefined)
    if (!roomState.pendingDecision) expect(hasCardConservation(roomState.gameState!)).toBe(true)
    const stale = once<string>(b, 'game:error'); b.emit('trade:confirm'); await expect(stale).resolves.toMatch(/quyết định|quyáº¿t Ä‘á»‹nh|phiên trao đổi|phiÃªn trao Ä‘á»•i/)
  })

  it.each(['depression', 'madness'] as DisorderId[])('keeps an active trade open when %s does not mutate a hand', async (disorderId) => {
    const { server, a, b, aSession } = await room(); const prepared = arrange(server, aSession.roomId, disorderId)
    const invited = once<unknown>(b, 'trade:state'); a.emit('trade:invite', { targetPlayerId: prepared.target.id }); await invited
    const accepted = once<unknown>(a, 'trade:state'); b.emit('trade:accept'); await accepted
    const placed = once<unknown>(a, 'trade:state'); b.emit('trade:place', { cardInstanceId: prepared.target.hand[0].instanceId }); await placed
    let closed = false; b.once('trade:closed', () => { closed = true })
    const state = once<GameView>(b, 'game:state'); a.emit('game:command', { type: 'playEpisode', episodeCardId: prepared.episode.instanceId, targetPlayerId: prepared.target.id, targetDisorderCardId: prepared.disorder.instanceId }); await state
    const continuing = once<unknown>(a, 'trade:state'); b.emit('trade:confirm'); await continuing
    expect(closed).toBe(false); expect(hasCardConservation(server.rooms.getRoom(aSession.roomId)!.gameState!)).toBe(true)
  })

  it('blocks trade mutation over sockets while Tremors is pending without changing choices or hands', async () => {
    const { server, a, b, aSession } = await room(); const prepared = arrange(server, aSession.roomId, 'tremors')
    const state = once<GameView>(b, 'game:state'); a.emit('game:command', { type: 'playEpisode', episodeCardId: prepared.episode.instanceId, targetPlayerId: prepared.target.id, targetDisorderCardId: prepared.disorder.instanceId }); const pending = (await state).pendingDecision!
    const before = structuredClone(server.rooms.getRoom(aSession.roomId)!.gameState!)
    for (const [socket, event, payload] of [[a, 'trade:invite', { targetPlayerId: prepared.target.id }], [b, 'trade:accept', undefined], [b, 'trade:place', { cardInstanceId: prepared.target.hand[0].instanceId }], [b, 'trade:confirm', undefined]] as const) {
      const error = once<string>(socket, 'game:error'); socket.emit(event, payload); await expect(error).resolves.toContain('quyết định')
    }
    expect(server.rooms.getRoom(aSession.roomId)!.pendingDecision?.id).toBe(pending.id); expect(server.rooms.getRoom(aSession.roomId)!.gameState).toEqual(before)
  })

  it('allows an Impotence-affected player to negotiate trade over Socket.IO', async () => {
    const { server, a, b, aSession } = await room(); const prepared = arrange(server, aSession.roomId, 'impotence')
    const state = once<GameView>(b, 'game:state'); a.emit('game:command', { type: 'playEpisode', episodeCardId: prepared.episode.instanceId, targetPlayerId: prepared.target.id, targetDisorderCardId: prepared.disorder.instanceId }); await state
    const invite = once<unknown>(b, 'trade:state'); b.emit('trade:invite', { targetPlayerId: prepared.attacker.id }); await invite
    const accept = once<unknown>(b, 'trade:state'); a.emit('trade:accept'); await accept
    const place = once<unknown>(a, 'trade:state'); b.emit('trade:place', { cardInstanceId: prepared.target.hand[0].instanceId }); await place
    expect(hasCardConservation(server.rooms.getRoom(aSession.roomId)!.gameState!)).toBe(true)
  })
})
