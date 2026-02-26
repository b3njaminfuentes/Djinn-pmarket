
import { useState, useEffect, useRef, useCallback } from 'react';

export interface ChartDataPoint {
    time: number;
    [outcome: string]: number;
}

export interface TradeEvent {
    id: string;
    side: string;
    amount: number;
    outcome: string;
    timestamp: number;
}

interface UseRealtimeChartOptions {
    marketId: string;
    outcomeNames: string[];
    initialData?: ChartDataPoint[];
    updateInterval?: number; // ms entre actualizaciones
    maxDataPoints?: number; // máximo de puntos a mantener
}

export function useRealtimeChart({
    marketId,
    outcomeNames,
    initialData = [],
    updateInterval = 5000,
    maxDataPoints = 1000
}: UseRealtimeChartOptions) {
    const [chartData, setChartData] = useState<ChartDataPoint[]>(initialData);
    const [latestTrade, setLatestTrade] = useState<TradeEvent | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const wsRef = useRef<WebSocket | null>(null);

    // Función para añadir un nuevo punto de datos
    const addDataPoint = useCallback((newPoint: ChartDataPoint) => {
        setChartData(prev => {
            const updated = [...prev, newPoint];
            // Limitar el número de puntos para evitar problemas de rendimiento
            if (updated.length > maxDataPoints) {
                return updated.slice(updated.length - maxDataPoints);
            }
            return updated;
        });
    }, [maxDataPoints]);

    // Función para actualizar el último punto (si la actualización es muy reciente)
    const updateLastDataPoint = useCallback((updates: Partial<ChartDataPoint>) => {
        setChartData(prev => {
            if (prev.length === 0) return prev;

            const lastPoint = prev[prev.length - 1];
            const now = Date.now();

            // Si el último punto fue hace menos de 30 segundos, actualízalo
            if (now - lastPoint.time < 30000) {
                const updatedLast = { ...lastPoint, ...updates, time: now };
                return [...prev.slice(0, -1), updatedLast];
            } else {
                // Si no, añade un nuevo punto
                return [...prev, { time: now, ...updates } as ChartDataPoint];
            }
        });
    }, []);

    // Conectar a WebSocket para actualizaciones en tiempo real
    useEffect(() => {
        // Simulation DISABLED — chart is seeded from real activity (reconstructHistory)
        // and updated only on real trades via setHistoryState in the buy/sell handlers.
        // Random noise was corrupting the chart across all time windows.
        setIsLoading(false);

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [marketId]); // eslint-disable-line react-hooks/exhaustive-deps

    // NO SIMULATION: Trade events only come from real WebSocket connection
    // latestTrade is set to null by default and only populated when:
    // 1. A real WebSocket message of type 'trade' is received
    // 2. Or when the buyShares/sellShares transaction completes in page.tsx
    // This ensures the +$USD indicators ONLY appear on actual trades

    // Función para conectar a WebSocket real (para implementación en producción)
    const connectWebSocket = useCallback((wsUrl: string) => {
        if (wsRef.current) {
            wsRef.current.close();
        }

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
            // Suscribirse a actualizaciones del mercado
            ws.send(JSON.stringify({
                type: 'subscribe',
                marketId: marketId
            }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'probability_update') {
                    updateLastDataPoint(data.probabilities);
                } else if (data.type === 'trade') {
                    setLatestTrade({
                        id: data.id,
                        side: data.side,
                        amount: data.amount,
                        outcome: data.outcome,
                        timestamp: data.timestamp
                    });
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            // Intentar reconectar después de 5 segundos
            setTimeout(() => {
                connectWebSocket(wsUrl);
            }, 5000);
        };

        wsRef.current = ws;
    }, [marketId, updateLastDataPoint]);

    return {
        chartData,
        latestTrade,
        isLoading,
        addDataPoint,
        updateLastDataPoint,
        connectWebSocket // Para usar en producción con WebSocket real
    };
}

// Hook adicional para calcular estadísticas del gráfico
export function useChartStats(data: ChartDataPoint[], outcomeNames: string[]) {
    const [stats, setStats] = useState<{
        current: Record<string, number>;
        change24h: Record<string, number>;
        high24h: Record<string, number>;
        low24h: Record<string, number>;
    }>({
        current: {},
        change24h: {},
        high24h: {},
        low24h: {}
    });

    useEffect(() => {
        if (data.length === 0) return;

        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const last24h = data.filter(d => d.time >= oneDayAgo);

        const newStats: typeof stats = {
            current: {},
            change24h: {},
            high24h: {},
            low24h: {}
        };

        outcomeNames.forEach(outcome => {
            const current = data[data.length - 1][outcome] || 0;
            newStats.current[outcome] = current;

            if (last24h.length > 0) {
                const start24h = last24h[0][outcome] || 0;
                newStats.change24h[outcome] = current - start24h;

                const values24h = last24h.map(d => d[outcome] || 0);
                newStats.high24h[outcome] = Math.max(...values24h);
                newStats.low24h[outcome] = Math.min(...values24h);
            }
        });

        setStats(newStats);
    }, [data, outcomeNames]);

    return stats;
}
