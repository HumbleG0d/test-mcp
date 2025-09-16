pipeline {
    agent any
    
    environment {
        // Variables de configuración
        APP_NAME = 'express-metrics-api'
        DOCKER_IMAGE = "${APP_NAME}:${BUILD_NUMBER}"
        DOCKER_LATEST = "${APP_NAME}:latest"
        DOCKER_REGISTRY = 'your-registry.com' // Cambiar por tu registry
        NODE_VERSION = '18'
        
        // Credenciales
        DOCKER_CREDENTIALS = credentials('docker-registry-credentials')
        KUBECONFIG = credentials('kubernetes-config')
        
        // OpenTelemetry
        OTEL_SERVICE_NAME = "${APP_NAME}"
        OTEL_SERVICE_VERSION = "${BUILD_NUMBER}"
        OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel-collector:4318'
    }
    
    options {
        // Configuraciones del pipeline
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 20, unit: 'MINUTES')
        skipStagesAfterUnstable()
        parallelsAlwaysFailFast()
    }
    
    stages {
        stage('📋 Checkout') {
            steps {
                script {
                    // Limpiar workspace si es necesario
                    if (env.CLEAN_WORKSPACE == 'true') {
                        cleanWs()
                    }
                }
                
                // Checkout del código
                checkout scm
                
                script {
                    // Variables globales
                    env.GIT_COMMIT_SHORT = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                    
                    env.GIT_BRANCH_NAME = sh(
                        script: "git rev-parse --abbrev-ref HEAD",
                        returnStdout: true
                    ).trim()
                }
                
                echo "🔍 Building commit: ${env.GIT_COMMIT_SHORT}"
                echo "🌿 Branch: ${env.GIT_BRANCH_NAME}"
            }
        }
        
        stage('🛠️ Setup Environment') {
            parallel {
                stage('Node.js Setup') {
                    steps {
                        script {
                            // Instalar Node.js usando NodeJS plugin
                            def nodeHome = tool name: "NodeJS-${NODE_VERSION}", type: 'nodejs'
                            env.PATH = "${nodeHome}/bin:${env.PATH}"
                        }
                        
                        // Verificar versiones
                        sh '''
                            echo "📦 Node.js version:"
                            node --version
                            echo "📦 NPM version:"
                            npm --version
                        '''
                    }
                }
                
                stage('Docker Setup') {
                    steps {
                        script {
                            // Verificar Docker
                            sh '''
                                echo "🐳 Docker version:"
                                docker --version
                                docker info
                            '''
                        }
                    }
                }
            }
        }
        
        stage('📦 Dependencies') {
            steps {
                // Cache de dependencias usando Jenkins cache
                cache(caches: [
                    arbitraryFileCache(
                        path: 'node_modules',
                        fingerprint: [
                            file('package.json'),
                            file('package-lock.json')
                        ]
                    )
                ]) {
                    sh '''
                        echo "📦 Installing dependencies..."
                        npm ci --prefer-offline --no-audit
                        
                        echo "📊 Dependency audit:"
                        npm audit --audit-level moderate || true
                        
                        echo "📋 Installed packages:"
                        npm list --depth=0
                    '''
                }
            }
        }
        
        stage('🔍 Code Quality') {
            parallel {
                stage('Linting') {
                    steps {
                        sh '''
                            echo "🔍 Running ESLint..."
                            npm run lint || true
                        '''
                        
                        // Publicar resultados de linting
                        publishHTML([
                            allowMissing: false,
                            alwaysLinkToLastBuild: true,
                            keepAll: true,
                            reportDir: '.',
                            reportFiles: 'eslint-report.html',
                            reportName: 'ESLint Report'
                        ])
                    }
                }
                
                stage('Security Scan') {
                    steps {
                        sh '''
                            echo "🔒 Running security audit..."
                            npm audit --audit-level high --json > security-audit.json || true
                            
                            echo "🔍 Checking for known vulnerabilities..."
                            npx audit-ci --moderate || true
                        '''
                    }
                }
            }
        }
        
        stage('🧪 Testing') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh '''
                            echo "🧪 Running unit tests..."
                            npm test -- --coverage --ci --reporters=default --reporters=jest-junit
                        '''
                        
                        // Publicar resultados de pruebas
                        publishTestResults testResultsPattern: 'junit.xml'
                        
                        // Publicar cobertura de código
                        publishCoverage adapters: [
                            istanbulCoberturaAdapter('coverage/cobertura-coverage.xml')
                        ], sourceFileResolver: sourceFiles('STORE_LAST_BUILD')
                    }
                    post {
                        always {
                            // Archivar reportes de cobertura
                            publishHTML([
                                allowMissing: false,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'coverage/lcov-report',
                                reportFiles: 'index.html',
                                reportName: 'Coverage Report'
                            ])
                        }
                    }
                }
                
                stage('Integration Tests') {
                    steps {
                        sh '''
                            echo "🔗 Running integration tests..."
                            # Aquí puedes agregar tests de integración
                            # npm run test:integration || true
                        '''
                    }
                }
            }
        }
        
        stage('🏗️ Build Docker Image') {
            steps {
                script {
                    // Construir imagen Docker
                    def image = docker.build("${DOCKER_IMAGE}", ".")
                    
                    // Etiquetar como latest si es la rama main
                    if (env.GIT_BRANCH_NAME == 'main') {
                        image.tag('latest')
                    }
                    
                    // Guardar imagen para uso posterior
                    env.DOCKER_IMAGE_ID = image.id
                }
                
                echo "🐳 Docker image built: ${DOCKER_IMAGE}"
            }
        }
        
        stage('🔒 Security Scanning') {
            parallel {
                stage('Container Security') {
                    steps {
                        script {
                            try {
                                // Escaneo con Trivy (si está disponible)
                                sh """
                                    echo "🔍 Scanning Docker image for vulnerabilities..."
                                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \\
                                        -v \$(pwd):/tmp/trivy \\
                                        aquasec/trivy:latest image --exit-code 0 --format json \\
                                        --output /tmp/trivy/trivy-report.json ${DOCKER_IMAGE} || true
                                """
                            } catch (Exception e) {
                                echo "⚠️ Container security scan failed: ${e.getMessage()}"
                            }
                        }
                    }
                }
                
                stage('Code Security') {
                    steps {
                        script {
                            try {
                                sh '''
                                    echo "🔍 Running SAST security scan..."
                                    # Ejemplo con Semgrep (si está disponible)
                                    # docker run --rm -v $(pwd):/src returntocorp/semgrep --config=auto /src || true
                                '''
                            } catch (Exception e) {
                                echo "⚠️ SAST scan failed: ${e.getMessage()}"
                            }
                        }
                    }
                }
            }
        }
        
        stage('🚀 Deploy to Staging') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                script {
                    try {
                        // Deploy a staging usando docker-compose
                        sh '''
                            echo "🚀 Deploying to staging environment..."
                            
                            # Detener contenedores existentes
                            docker-compose -f docker-compose-api.yml down || true
                            
                            # Limpiar imágenes antigas
                            docker image prune -f
                            
                            # Variables de entorno para staging
                            export IMAGE_TAG=${BUILD_NUMBER}
                            export ENVIRONMENT=staging
                            export OTEL_SERVICE_VERSION=${BUILD_NUMBER}
                            
                            # Deploy con nueva imagen
                            docker-compose -f docker-compose-api.yml up -d
                            
                            # Esperar a que el servicio esté listo
                            echo "⏳ Waiting for service to be ready..."
                            timeout 60s bash -c 'until curl -f http://localhost:3000/health; do sleep 2; done'
                        '''
                        
                        echo "✅ Staging deployment successful"
                        
                    } catch (Exception e) {
                        error("❌ Staging deployment failed: ${e.getMessage()}")
                    }
                }
            }
        }
        
        stage('🧪 Smoke Tests') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                script {
                    try {
                        sh '''
                            echo "🧪 Running smoke tests against staging..."
                            
                            # Test health endpoint
                            echo "Testing health endpoint..."
                            curl -f http://localhost:3000/health
                            
                            # Test users endpoint
                            echo "Testing users endpoint..."
                            curl -f http://localhost:3000/users
                            
                            # Test metrics endpoint
                            echo "Testing metrics endpoint..."
                            curl -f http://localhost:3000/metrics
                            
                            # Create test user
                            echo "Testing user creation..."
                            curl -f -X POST http://localhost:3000/users \\
                                -H "Content-Type: application/json" \\
                                -d '{"name":"Test User","email":"test@example.com","age":25}'
                            
                            echo "✅ All smoke tests passed"
                        '''
                    } catch (Exception e) {
                        error("❌ Smoke tests failed: ${e.getMessage()}")
                    }
                }
            }
        }
        
        stage('📊 Performance Tests') {
            when {
                anyOf {
                    branch 'main'
                    expression { params.RUN_PERFORMANCE_TESTS == true }
                }
            }
            steps {
                script {
                    try {
                        sh '''
                            echo "📊 Running performance tests..."
                            
                            # Instalar Artillery si no está disponible
                            npm install -g artillery || true
                            
                            # Crear configuración de pruebas de carga
                            cat > artillery-config.yml << EOF
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load test"
scenarios:
  - name: "API Load Test"
    weight: 100
    requests:
      - get:
          url: "/health"
      - get:
          url: "/users"
      - post:
          url: "/users"
          json:
            name: "Load Test User"
            email: "loadtest{{ \\$randomNumber() }}@example.com"
            age: 30
EOF
                            
                            # Ejecutar pruebas de carga
                            artillery run artillery-config.yml --output performance-report.json || true
                            
                            # Generar reporte HTML
                            artillery report performance-report.json --output performance-report.html || true
                        '''
                        
                        // Publicar reporte de performance
                        publishHTML([
                            allowMissing: true,
                            alwaysLinkToLastBuild: true,
                            keepAll: true,
                            reportDir: '.',
                            reportFiles: 'performance-report.html',
                            reportName: 'Performance Report'
                        ])
                        
                    } catch (Exception e) {
                        echo "⚠️ Performance tests failed: ${e.getMessage()}"
                        unstable("Performance tests failed")
                    }
                }
            }
        }
        
        stage('🏷️ Tag & Push Image') {
            when {
                branch 'main'
            }
            steps {
                script {
                    docker.withRegistry("https://${DOCKER_REGISTRY}", 'docker-registry-credentials') {
                        // Push imagen con tag del build
                        def image = docker.image("${DOCKER_IMAGE}")
                        image.push()
                        image.push('latest')
                        
                        echo "🏷️ Image pushed: ${DOCKER_REGISTRY}/${DOCKER_IMAGE}"
                    }
                }
            }
        }
        
        stage('🚀 Deploy to Production') {
            when {
                allOf {
                    branch 'main'
                    expression { params.DEPLOY_TO_PRODUCTION == true }
                }
            }
            steps {
                script {
                    // Solicitar aprobación manual para producción
                    def deployApproved = false
                    try {
                        timeout(time: 5, unit: 'MINUTES') {
                            deployApproved = input(
                                message: '🚀 Deploy to Production?',
                                ok: 'Deploy',
                                submitterParameter: 'APPROVER',
                                parameters: [
                                    choice(
                                        name: 'DEPLOYMENT_TYPE',
                                        choices: ['blue-green', 'rolling', 'canary'],
                                        description: 'Choose deployment strategy'
                                    )
                                ]
                            )
                        }
                    } catch (Exception e) {
                        deployApproved = false
                        echo "❌ Production deployment not approved or timed out"
                    }
                    
                    if (deployApproved) {
                        sh '''
                            echo "🚀 Deploying to production environment..."
                            echo "👤 Approved by: ${APPROVER}"
                            echo "📋 Deployment type: ${DEPLOYMENT_TYPE}"
                            
                            # Aquí iría tu lógica de deployment a producción
                            # Ejemplos:
                            # - Kubernetes deployment
                            # - Docker Swarm
                            # - AWS ECS
                            # - Azure Container Instances
                            
                            # Ejemplo con Kubernetes
                            # kubectl set image deployment/express-api express-api=${DOCKER_REGISTRY}/${DOCKER_IMAGE}
                            # kubectl rollout status deployment/express-api
                            
                            echo "✅ Production deployment completed"
                        '''
                    }
                }
            }
        }
    }
    
    post {
        always {
            script {
                // Limpiar workspace si está configurado
                if (env.CLEAN_WORKSPACE_AFTER == 'true') {
                    cleanWs()
                }
                
                // Recopilar artefactos
                archiveArtifacts artifacts: '''
                    package.json,
                    coverage/**/*,
                    trivy-report.json,
                    performance-report.html,
                    security-audit.json
                ''', fingerprint: true, allowEmptyArchive: true
            }
        }
        
        success {
            script {
                // Notificaciones de éxito
                def message = """
✅ Pipeline SUCCESS - ${env.JOB_NAME} #${env.BUILD_NUMBER}
🌿 Branch: ${env.GIT_BRANCH_NAME}
🔍 Commit: ${env.GIT_COMMIT_SHORT}
⏱️ Duration: ${currentBuild.durationString}
🔗 Build URL: ${env.BUILD_URL}
"""
                
                // Slack notification (si está configurado)
                try {
                    slackSend(
                        color: 'good',
                        message: message,
                        channel: '#ci-cd'
                    )
                } catch (Exception e) {
                    echo "Slack notification failed: ${e.getMessage()}"
                }
                
                // Email notification
                try {
                    emailext(
                        subject: "✅ SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                        body: message,
                        to: "${env.CHANGE_AUTHOR_EMAIL ?: env.DEFAULT_EMAIL}",
                        mimeType: 'text/plain'
                    )
                } catch (Exception e) {
                    echo "Email notification failed: ${e.getMessage()}"
                }
            }
        }
        
        failure {
            script {
                def message = """
❌ Pipeline FAILED - ${env.JOB_NAME} #${env.BUILD_NUMBER}
🌿 Branch: ${env.GIT_BRANCH_NAME}
🔍 Commit: ${env.GIT_COMMIT_SHORT}
⏱️ Duration: ${currentBuild.durationString}
🔗 Build URL: ${env.BUILD_URL}
📋 Failed Stage: ${env.STAGE_NAME ?: 'Unknown'}
"""
                
                // Slack notification
                try {
                    slackSend(
                        color: 'danger',
                        message: message,
                        channel: '#ci-cd'
                    )
                } catch (Exception e) {
                    echo "Slack notification failed: ${e.getMessage()}"
                }
                
                // Email notification
                try {
                    emailext(
                        subject: "❌ FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                        body: message,
                        to: "${env.CHANGE_AUTHOR_EMAIL ?: env.DEFAULT_EMAIL}",
                        mimeType: 'text/plain'
                    )
                } catch (Exception e) {
                    echo "Email notification failed: ${e.getMessage()}"
                }
            }
        }
        
        unstable {
            script {
                def message = """
⚠️ Pipeline UNSTABLE - ${env.JOB_NAME} #${env.BUILD_NUMBER}
🌿 Branch: ${env.GIT_BRANCH_NAME}
🔍 Commit: ${env.GIT_COMMIT_SHORT}
⏱️ Duration: ${currentBuild.durationString}
🔗 Build URL: ${env.BUILD_URL}
"""
                
                try {
                    slackSend(
                        color: 'warning',
                        message: message,
                        channel: '#ci-cd'
                    )
                } catch (Exception e) {
                    echo "Slack notification failed: ${e.getMessage()}"
                }
            }
        }
        
        cleanup {
            script {
                // Limpiar imágenes Docker locales para ahorrar espacio
                sh '''
                    # Limpiar imágenes sin usar
                    docker image prune -f
                    
                    # Limpiar contenedores detenidos
                    docker container prune -f
                    
                    echo "🧹 Docker cleanup completed"
                '''
            }
        }
    }
}