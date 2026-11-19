# MyStudySpace

MyStudySpace is a study room reservation system developed for Kean University. The system is designed to make finding and reserving study rooms easier by allowing users to browse room availability, explore room locations through an interactive library map, and manage their reservations.

## Accessing the System

**Important:** Access to the Kean University VPN is currently required to access the deployed application.

To try the system:

1. Connect to the Kean University VPN using your Kean credentials.
2. Open the deployed application using the link below.

**Deployed Application:** [INSERT VERCEL DEPLOYMENT URL]

If you are unable to access the application, make sure you are connected to the Kean VPN before trying again.

## Features

MyStudySpace is being developed with features for both students and library staff.

### Student Features
- Browse available study rooms.
- Filter rooms by preferred date, time, floor, and room accessories.
- View room locations through an interactive library map.
- Select individual rooms to view additional details, including room capacity and photos.
- Make and manage study room reservations.
- Check in to reservations and report occupancy conflicts.

### Staff Features
- Access a staff dashboard.
- Manage study room reservations.
- Manage room availability.
- Monitor check-ins and no-shows.
- Review reported occupancy conflicts.
- View room usage information.

*Note: Features are being implemented incrementally, so not all functionality may be available in the current deployment.*

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML, CSS, JavaScript | Frontend development |
| MySQL | Relational database |
| Node.js | Backend functionality |
| Vercel | Application deployment |
| Git & GitHub | Version control and collaboration |

## Running the Project Locally

If you would like to run the project on your own machine, follow these steps.

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/)
- [Git](https://git-scm.com/)
- [Vercel CLI](https://vercel.com/docs/cli)
- MySQL

You will also need:
- Access to the Kean University VPN.
- Access to the project's MySQL database or a separately configured development database.
- The required project environment variables.

### 1. Clone the Repository

Open your terminal and run:

```bash
git clone https://github.com/SarahMalabanan/MyStudySpace.git
```

Navigate into the project directory:

```bash
cd MyStudySpace
```

### 2. Install Dependencies

Run:

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory.

Add the environment variables required by the project. These may include:

```env
DB_HOST=your_database_host
DB_USER=your_database_username
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
SESSION_SECRET=your_session_secret
```

Replace the example values with the appropriate credentials and configuration.

**Important:** Environment variables and database credentials should be obtained from the project administrators. Never commit `.env.local` or other files containing private credentials to GitHub.

### 4. Start the Development Server

Run:

```bash
vercel dev
```

Once the server starts, open the local development URL provided in your terminal (typically `http://localhost:3000`).

**Note:** The local application may require an active Kean VPN connection and authorized database access to function correctly.

## Repository Structure

The project is organized into frontend files, backend API functionality, and database connection utilities.

```text
MyStudySpace/
│
├── api/                 # Backend API endpoints
│
├── lib/                 # Shared utilities and database connection
│
├── public/              # Static assets and images
│
├── index.html           # Main application page
│
├── package.json         # Project dependencies and scripts
│
├── .gitignore           # Files excluded from Git
│
└── README.md            # Project documentation
```

*The repository structure may change as development continues.*

## Deployment

MyStudySpace is deployed using Vercel and connected to the team's GitHub repository.

Changes pushed to the configured deployment branch can trigger a new deployment through Vercel.

The deployed application currently requires access to the Kean University VPN.

## Project Information

**Project:** MyStudySpace  
**Institution:** Kean University  
**Purpose:** Study room reservation and management system  
**Repository:** [GitHub - MyStudySpace](https://github.com/SarahMalabanan/MyStudySpace)

Developed as part of a software engineering course project.