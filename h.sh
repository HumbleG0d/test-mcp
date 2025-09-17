#!/bin/bash

echo "🎉 APM SERVER CONECTADO - PROBANDO MÉTRICAS"
echo "==========================================="

# Función para verificar estado de servicios
check_services() {
    echo "🔍 Verificando servicios..."
    
    # API
    if curl -f -s http://localhost:3000/health > /dev/null; then
        echo "✅ API funcionando (puerto 3000)"
    else
        echo "❌ API no responde"
        return 1
    fi
    
    # APM Server
    if curl -f -s http://localhost:8200 > /dev/null; then
        echo "✅ APM Server funcionando (puerto 8200)"
    else
        echo "❌ APM Server no responde"
    fi
    
    # Collector
    if curl -f -s http://localhost:4318 > /dev/null 2>&1; then
        echo "✅ Collector funcionando (puerto 4318)"
    else
        echo "❌ Collector no responde"
    fi
    
    # Elasticsearch
    if curl -f -s -u elastic:somethingsecret http://localhost:9200 > /dev/null; then
        echo "✅ Elasticsearch funcionando (puerto 9200)"
    else
        echo "❌ Elasticsearch no responde"
        return 1
    fi
    
    echo ""
}

# Función para generar tráfico intensivo
generate_intensive_traffic() {
    echo "🚀 Generando tráfico intensivo para crear métricas..."
    
    # Requests GET
    echo "📊 Haciendo 15 requests GET /users..."
    for i in {1..15}; do
        curl -s http://localhost:3000/users > /dev/null &
        if [ $((i % 5)) -eq 0 ]; then
            echo "  ✓ $i/15 requests enviados"
        fi
    done
    wait
    
    # Health checks
    echo "❤️ Haciendo 10 health checks..."
    for i in {1..10}; do
        curl -s http://localhost:3000/health > /dev/null &
    done
    wait
    
    # Crear usuarios
    echo "👥 Creando 5 usuarios..."
    for i in {1..5}; do
        curl -s -X POST http://localhost:3000/users \
            -H "Content-Type: application/json" \
            -d "{\"name\":\"Metrics User $i\",\"email\":\"metrics$i@$(date +%s).com\",\"age\":$((20 + i))}" > /dev/null &
    done
    wait
    
    # Generar algunos errores
    echo "⚠️ Generando 3 errores para testing..."
    for i in {1..3}; do
        curl -s http://localhost:3000/users/nonexistent$i > /dev/null &
        curl -s http://localhost:3000/error > /dev/null 2>&1 &
    done
    wait
    
    # Load test
    echo "💪 Haciendo 3 load tests..."
    for i in {1..3}; do
        curl -s http://localhost:3000/load-test > /dev/null &
    done
    wait
    
    echo "✅ Tráfico generado: 15 GET + 10 health + 5 POST + 6 errores + 3 load tests"
}

# Función para verificar métricas directas
check_direct_metrics() {
    echo "📊 Verificando métricas directas de la API..."
    echo "Endpoint: http://localhost:3000/metrics"
    echo "----------------------------------------"
    
    metrics=$(curl -s http://localhost:3000/metrics)
    
    # Buscar métricas específicas
    echo "🔍 Métricas personalizadas encontradas:"
    echo "$metrics" | grep -E "api_requests_total|api_users_created|api_request_duration" || echo "❌ No se encontraron métricas personalizadas"
    
    echo ""
}

# Función para verificar collector
check_collector_metrics() {
    echo "🔧 Verificando métricas del Collector..."
    
    # Health check
    collector_health=$(curl -s http://localhost:13133 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "✅ Collector health check OK"
    fi
    
    # Métricas del collector (si están disponibles)
    if curl -s http://localhost:8889/metrics >/dev/null 2>&1; then
        echo "📈 Métricas Prometheus del Collector:"
        curl -s http://localhost:8889/metrics | grep -E "(otelcol_receiver|otelcol_exporter)" | head -5 || echo "No hay métricas específicas del collector"
    fi
    
    echo ""
}

# Función para buscar en Elasticsearch
search_elasticsearch() {
    echo "🔍 Buscando datos en Elasticsearch..."
    
    # Esperar a que los datos se procesen
    echo "⏳ Esperando 20 segundos para que se procesen las métricas..."
    sleep 20
    
    # Buscar documentos recientes
    echo "📋 Buscando documentos de los últimos 5 minutos..."
    
    # Query para buscar trazas de la API
    local query='{
        "query": {
            "bool": {
                "should": [
                    {"term": {"service.name": "express-metrics-api"}},
                    {"wildcard": {"service.name": "*express*"}},
                    {"wildcard": {"span.name": "*users*"}},
                    {"term": {"http.method": "GET"}}
                ],
                "minimum_should_match": 1,
                "must": [
                    {"range": {"@timestamp": {"gte": "now-5m"}}}
                ]
            }
        },
        "size": 5,
        "_source": ["@timestamp", "service.name", "span.name", "http.method", "http.status_code", "duration"],
        "sort": [{"@timestamp": {"order": "desc"}}]
    }'
    
    # Buscar en todos los índices
    result=$(curl -s -u elastic:somethingsecret -X POST "http://localhost:9200/_search" \
        -H "Content-Type: application/json" \
        -d "$query")
    
    total_hits=$(echo "$result" | jq -r '.hits.total.value // 0' 2>/dev/null)
    echo "📊 Total de documentos encontrados: $total_hits"
    
    if [ "$total_hits" -gt 0 ]; then
        echo "✅ ¡MÉTRICAS ENCONTRADAS EN ELASTICSEARCH!"
        echo "📄 Ejemplo de documento:"
        echo "$result" | jq '.hits.hits[0]._source // {}' 2>/dev/null
        
        # Mostrar más detalles
        echo -e "\n📋 Resumen de documentos encontrados:"
        echo "$result" | jq -r '.hits.hits[] | "• " + (._source["@timestamp"] // "N/A") + " - " + (._source.service.name // "N/A") + " - " + (._source.span.name // ._source.http.method // "N/A")' 2>/dev/null | head -3
        
        return 0
    else
        echo "❌ No se encontraron documentos"
        
        # Buscar en índices específicos
        echo "🔍 Verificando índices específicos..."
        curl -s -u elastic:somethingsecret "http://localhost:9200/_cat/indices?v" | grep -E "(apm|otel|traces|metrics)" | while read line; do
            index_name=$(echo $line | awk '{print $3}')
            doc_count=$(echo $line | awk '{print $7}')
            if [ "$doc_count" -gt 0 ]; then
                echo "📚 $index_name: $doc_count documentos"
            fi
        done
        
        return 1
    fi
}

# Función para mostrar URLs útiles
show_urls() {
    echo "🔗 URLs para verificar métricas:"
    echo "================================"
    echo "• API Métricas: http://localhost:3000/metrics"
    echo "• API Health: http://localhost:3000/health"
    echo "• Kibana: http://localhost:5601 (elastic/somethingsecret)"
    echo "• Elasticsearch: http://localhost:9200"
    echo "• APM Server: http://localhost:8200"
    
    if curl -s http://localhost:8889/metrics >/dev/null 2>&1; then
        echo "• Collector Prometheus: http://localhost:8889/metrics"
    fi
    
    if curl -s http://localhost:13133 >/dev/null 2>&1; then
        echo "• Collector Health: http://localhost:13133"
    fi
}

# Función para mostrar pasos siguientes
show_next_steps() {
    echo "🎯 PRÓXIMOS PASOS PARA VER MÉTRICAS EN KIBANA:"
    echo "============================================="
    echo "1. Ve a: http://localhost:5601"
    echo "2. Login: elastic / somethingsecret"
    echo "3. Ve a: Analytics → Discover"
    echo "4. Selecciona index pattern: apm-* o traces-* o otel-*"
    echo "5. Busca: service.name:express-metrics-api"
    echo "6. También ve a: Observability → APM"
    echo "7. Deberías ver el servicio 'express-metrics-api'"
    echo ""
    echo "📊 Para gráficos y dashboards:"
    echo "• Observability → APM → Services → express-metrics-api"
    echo "• Analytics → Visualize Library (crear gráficos custom)"
    echo "• Analytics → Dashboard (crear dashboard personalizado)"
}

# Función principal
main() {
    check_services || exit 1
    
    generate_intensive_traffic
    
    check_direct_metrics
    
    check_collector_metrics
    
    if search_elasticsearch; then
        echo -e "\n🎉 ¡ÉXITO! Las métricas están llegando a Elasticsearch"
        show_next_steps
    else
        echo -e "\n⚠️ Las métricas no están llegando aún a Elasticsearch"
        echo "🔧 Revisa los logs:"
        echo "  docker logs express-metrics-api"
        echo "  docker logs otel-collector"
        echo "  docker logs apm-server"
    fi
    
    show_urls
}

# Ejecutar
main "$@"
# Mantener abierto
echo "🛑 Script finalizado, presiona Ctrl+C para salir..."
while true; do
    sleep 60
done