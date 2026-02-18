FROM eclipse-mosquitto

# Create config directory
RUN mkdir -p /mosquitto/config /mosquitto/data /mosquitto/log

# Copy configuration
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY passwd /mosquitto/config/passwd

# Expose ports
EXPOSE 1883
EXPOSE 9001

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
